import type { RailwayUsageResponse, RailwayUsageRow, UsageValueSource } from "@/lib/usage/types";
import {
  clampRemaining,
  fmtDateOnly,
  getCached,
  getCurrentMonthRange,
  parseNumberEnv,
  setCached,
  stableNowIso,
  usagePercent,
  usageStatus,
} from "@/lib/usage/shared";

type RailwayGraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

type ProjectBasics = {
  project?: {
    id: string;
    name: string;
    workspace?: {
      id: string;
      name: string;
      plan?: string | null;
      customer?: {
        currentUsage?: number | null;
        creditBalance?: number | null;
        billingPeriod?: { start: string; end: string } | null;
        usageLimit?: {
          softLimit: number;
          hardLimit?: number | null;
          isOverLimit?: boolean | null;
        } | null;
      } | null;
    } | null;
    services?: {
      edges?: Array<{ node?: { id: string; name: string } | null }>;
    } | null;
  } | null;
};

type RootEstimatedUsage = {
  estimatedUsage?: Array<{
    measurement?: string | null;
    estimatedValue?: number | null;
    projectId?: string | null;
  }> | null;
};

type UsageAggregate = {
  usage?: Array<{
    measurement?: string | null;
    value?: number | null;
  }> | null;
};

type MetricsResponse = {
  metrics?: Array<{
    measurement?: string | null;
    values?: Array<{ ts?: string | null; value?: number | null }> | null;
  }> | null;
};

const RAILWAY_GRAPHQL_ENDPOINT = "https://backboard.railway.com/graphql/v2";
const METRICS = ["CPU_USAGE", "MEMORY_USAGE_GB", "NETWORK_TX_GB", "DISK_USAGE_GB"] as const;

function normalizeRailwayApiToken(raw: string | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  let t = raw.trim();
  if (!t) return null;
  if (/^bearer\s+/i.test(t)) t = t.replace(/^bearer\s+/i, "").trim();
  return t || null;
}

/** Turn Railway GraphQL/HTTP failures into actionable messages for the usage dashboard. */
function explainRailwayFailure(message: string): string {
  if (message.startsWith("Railway rejected the request (not authorized).")) return message;
  const lower = message.toLowerCase();
  if (
    lower.includes("not authorized") ||
    lower.includes("unauthorized") ||
    lower.includes("forbidden") ||
    lower.includes("permission denied")
  ) {
    return [
      "Railway rejected the request (not authorized).",
      "Fix: In Railway → Account Settings → Tokens, create an account API token with access to this project (workspace-only tokens often cannot read usage GraphQL).",
      "Set RAILWAY_API_TOKEN in your server env (no extra \"Bearer \" prefix). Confirm RAILWAY_PROJECT_ID is the project UUID from Project Settings.",
      `Provider: ${message}`,
    ].join(" ");
  }
  return message;
}

/** Railway metric series sometimes returns Unix seconds; JS Date expects ms. */
function normalizeRailwayMetricTs(ts: string | number | null | undefined): string | null {
  if (ts == null) return null;
  if (typeof ts === "number") {
    const ms = ts > 0 && ts < 1e12 ? ts * 1000 : ts;
    return new Date(ms).toISOString();
  }
  const s = String(ts).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const ms = n > 0 && n < 1e12 ? n * 1000 : n;
    return new Date(ms).toISOString();
  }
  return s;
}

function railwayPlanLabel(plan: string | null | undefined): string | null {
  if (!plan) return null;
  const map: Record<string, string> = { FREE: "Free", HOBBY: "Hobby", PRO: "Pro" };
  return map[plan] || plan;
}

/** Usage limits in GraphQL are stored in cents (see UsageLimit / billing types). */
function usageLimitCentsToUsd(cents: number): number {
  return cents / 100;
}

function metricUnit(metric: string) {
  switch (metric) {
    case "CPU_USAGE":
      return "vCPU-min";
    case "MEMORY_USAGE_GB":
      return "GB-min";
    case "NETWORK_TX_GB":
      return "GB";
    case "DISK_USAGE_GB":
      return "GB-min";
    default:
      return null;
  }
}

async function railwayGraphql<T>(query: string, variables: Record<string, unknown>) {
  const token = normalizeRailwayApiToken(process.env.RAILWAY_API_TOKEN);
  if (!token) {
    throw new Error(
      "RAILWAY_API_TOKEN is not configured. Add an account API token from Railway → Account Settings → Tokens."
    );
  }
  const res = await fetch(RAILWAY_GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Railway API ${res.status}: ${detail || res.statusText}`);
  }
  const json = (await res.json()) as RailwayGraphQlResponse<T>;
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message || "GraphQL error").join("; "));
  }
  return json.data as T;
}

function valueSourceFromLimit(limit: number | null): UsageValueSource {
  return limit != null ? "Configured manually" : "Unavailable from provider";
}

export async function getRailwayUsage(range: { start: string; end: string }, opts?: { refresh?: boolean }): Promise<RailwayUsageResponse> {
  const cacheKey = `usage:railway:${range.start}:${range.end}`;
  if (!opts?.refresh) {
    const cached = getCached<RailwayUsageResponse>(cacheKey);
    if (cached) return cached;
  }

  const nowIso = stableNowIso();
  const monthRange = getCurrentMonthRange();
  const projectId = process.env.RAILWAY_PROJECT_ID || null;
  const serviceId = process.env.RAILWAY_SERVICE_ID || null;
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID || null;
  const usageLimit = parseNumberEnv(process.env.RAILWAY_USAGE_LIMIT);
  const configuredPlan = process.env.RAILWAY_PLAN_NAME?.trim() || null;

  if (!projectId) {
    const unavailable: RailwayUsageResponse = {
      provider: "railway",
      available: false,
      error: "RAILWAY_PROJECT_ID is not configured.",
      date_range: { preset: "custom", start: range.start, end: range.end },
      current_plan: configuredPlan,
      current_plan_source: configuredPlan ? "Configured manually" : "Unavailable from provider",
      billing_period_start: monthRange.start,
      billing_period_end: monthRange.end,
      billing_period_source: "Calculated estimate",
      current_usage_usd: null,
      current_usage_source: "Unavailable from provider",
      estimated_usage_usd: null,
      estimated_usage_source: "Unavailable from provider",
      usage_limit_usd: usageLimit,
      usage_limit_source: valueSourceFromLimit(usageLimit),
      remaining_quota_usd: null,
      remaining_quota_source: "Unavailable from provider",
      active_project: { id: null, name: null },
      active_service: serviceId ? { id: serviceId, name: serviceId } : null,
      service_breakdown: [],
      rows: [],
      status: "Healthy",
      usage_percent: null,
      data_source: {
        provider: "railway",
        available: false,
        source: "Unavailable from provider",
        notes: ["Set RAILWAY_PROJECT_ID to fetch real Railway usage data."],
      },
      last_synced_at: nowIso,
    };
    setCached(cacheKey, unavailable, 60_000);
    return unavailable;
  }

  const notes: string[] = [];

  try {
    const basic = await railwayGraphql<ProjectBasics>(
      `
        query UsageProjectBasics($projectId: String!) {
          project(id: $projectId) {
            id
            name
            workspace {
              id
              name
              plan
              customer {
                currentUsage
                creditBalance
                billingPeriod {
                  start
                  end
                }
                usageLimit {
                  softLimit
                  hardLimit
                  isOverLimit
                }
              }
            }
            services {
              edges {
                node {
                  id
                  name
                }
              }
            }
          }
        }
      `,
      { projectId }
    );
    const project = basic.project || null;
    const workspaceName = project?.workspace?.name || null;
    const customer = project?.workspace?.customer || null;
    const billingPeriodStart = customer?.billingPeriod?.start || monthRange.start;
    const billingPeriodEnd = customer?.billingPeriod?.end || monthRange.end;
    const providerLimitUsd = customer?.usageLimit != null ? usageLimitCentsToUsd(customer.usageLimit.softLimit) : null;
    const effectiveUsageLimit = usageLimit ?? providerLimitUsd;
    const currentUsageUsd = customer?.currentUsage != null ? Number(customer.currentUsage) : null;
    const planFromApi = project?.workspace?.plan || null;
    const currentPlanDisplay =
      configuredPlan ?? (planFromApi ? `${railwayPlanLabel(planFromApi) ?? planFromApi} Plan` : null);
    const currentPlanSource = configuredPlan
      ? "Configured manually"
      : planFromApi
        ? "Provider direct"
        : "Unavailable from provider";
    const services =
      project?.services?.edges?.map((edge) => edge.node).filter((node): node is { id: string; name: string } => Boolean(node?.id && node?.name)) || [];

    const estimatedRoot = await railwayGraphql<RootEstimatedUsage>(
      `
        query EstimatedUsageForProject($measurements: [MetricMeasurement!]!, $projectId: String!, $includeDeleted: Boolean) {
          estimatedUsage(measurements: $measurements, projectId: $projectId, includeDeleted: $includeDeleted) {
            measurement
            estimatedValue
            projectId
          }
        }
      `,
      { measurements: [...METRICS], projectId, includeDeleted: false }
    ).catch((error) => {
      notes.push(`Project estimated metric usage unavailable from provider: ${error instanceof Error ? error.message : String(error)}`);
      return { estimatedUsage: [] } satisfies RootEstimatedUsage;
    });

    const aggregate = await railwayGraphql<UsageAggregate>(
      `
        query UsageAggregate(
          $projectId: String!,
          $measurements: [MetricMeasurement!]!,
          $startDate: DateTime!,
          $endDate: DateTime!
        ) {
          usage(
            projectId: $projectId
            measurements: $measurements
            startDate: $startDate
            endDate: $endDate
          ) {
            measurement
            value
          }
        }
      `,
      {
        projectId,
        measurements: [...METRICS],
        startDate: range.start,
        endDate: range.end,
      }
    ).catch((error) => {
      notes.push(`Aggregated Railway usage unavailable from provider: ${error instanceof Error ? error.message : String(error)}`);
      return { usage: [] } satisfies UsageAggregate;
    });

    const serviceTargets = serviceId
      ? services.filter((service) => service.id === serviceId)
      : services;
    const metricRows: RailwayUsageRow[] = [];
    const serviceBreakdown: RailwayUsageResponse["service_breakdown"] = [];

    for (const service of serviceTargets) {
      const metricsData = await railwayGraphql<MetricsResponse>(
        `
          query UsageMetrics(
            $projectId: String!,
            $measurements: [MetricMeasurement!]!,
            $startDate: DateTime!,
            $endDate: DateTime!,
            $serviceId: String,
            $environmentId: String
          ) {
            metrics(
              projectId: $projectId
              measurements: $measurements
              startDate: $startDate
              endDate: $endDate
              serviceId: $serviceId
              environmentId: $environmentId
            ) {
              measurement
              values {
                ts
                value
              }
            }
          }
        `,
        {
          projectId,
          measurements: [...METRICS],
          startDate: range.start,
          endDate: range.end,
          serviceId: service.id,
          environmentId,
        }
      ).catch((error) => {
        notes.push(`Service metrics unavailable for ${service.name}: ${error instanceof Error ? error.message : String(error)}`);
        return { metrics: [] } satisfies MetricsResponse;
      });

      const estimatedMetrics = (estimatedRoot.estimatedUsage || []).filter((item) => item.projectId === projectId);

      const metrics = (metricsData.metrics || []).map((metric) => {
        const metricType = String(metric.measurement || "Unknown");
        const usageValue = (metric.values || []).reduce((sum, point) => sum + Number(point.value || 0), 0);
        const estimatedValue =
          estimatedMetrics.find((item) => item.measurement === metricType)?.estimatedValue ?? null;
        return {
          metric_type: metricType,
          usage_value: Number.isFinite(usageValue) ? usageValue : null,
          estimated_usage_value: estimatedValue != null ? Number(estimatedValue) : null,
          usage_unit: metricUnit(metricType),
          source: "Provider direct" as UsageValueSource,
        };
      });

      serviceBreakdown.push({
        service_id: service.id,
        service_name: service.name,
        metrics,
      });

      for (const metric of metricsData.metrics || []) {
        const metricType = String(metric.measurement || "Unknown");
        const estimatedValue =
          estimatedRoot.estimatedUsage?.find((item) => item.projectId === projectId && item.measurement === metricType)?.estimatedValue ?? null;
        for (const point of metric.values || []) {
          const tsIso = normalizeRailwayMetricTs(point.ts);
          const date = tsIso ? fmtDateOnly(tsIso) : fmtDateOnly(range.start);
          metricRows.push({
            date,
            scope: `${workspaceName || "Workspace"} / ${project?.name || "Project"} / ${service.name}`,
            metric_type: metricType,
            usage_value: point.value != null ? Number(point.value) : null,
            estimated_usage_value: estimatedValue != null ? Number(estimatedValue) : null,
            usage_unit: metricUnit(metricType),
            limit_value: effectiveUsageLimit,
            remaining_value: clampRemaining(effectiveUsageLimit, currentUsageUsd),
            billing_period: `${fmtDateOnly(billingPeriodStart)} -> ${fmtDateOnly(billingPeriodEnd)}`,
            source: "Provider direct",
            status: usageStatus(effectiveUsageLimit, currentUsageUsd),
          });
        }
      }
    }

    const estimatedUsageUsd = (() => {
      if (currentUsageUsd == null) return null;
      const periodStart = new Date(billingPeriodStart);
      const periodEnd = new Date(billingPeriodEnd);
      const now = Date.now();
      const endMs = Math.min(periodEnd.getTime(), now);
      const elapsedDays = Math.max(1, Math.ceil((endMs - periodStart.getTime()) / 86_400_000));
      const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86_400_000));
      return (currentUsageUsd / elapsedDays) * totalDays;
    })();

    const remainingQuota = clampRemaining(effectiveUsageLimit, currentUsageUsd);
    const percent = usagePercent(effectiveUsageLimit, currentUsageUsd);
    const status = usageStatus(effectiveUsageLimit, currentUsageUsd);

    const aggregateRows = (aggregate.usage || []).map((entry) => ({
      date: fmtDateOnly(range.end),
      scope: `${workspaceName || "Workspace"} / ${project?.name || "Project"}${serviceId ? ` / ${serviceId}` : ""}`,
      metric_type: String(entry.measurement || "Unknown"),
      usage_value: entry.value != null ? Number(entry.value) : null,
      estimated_usage_value:
        estimatedRoot.estimatedUsage?.find((item) => item.projectId === projectId && item.measurement === entry.measurement)?.estimatedValue ?? null,
      usage_unit: metricUnit(String(entry.measurement || "Unknown")),
      limit_value: effectiveUsageLimit,
      remaining_value: remainingQuota,
      billing_period: `${fmtDateOnly(billingPeriodStart)} -> ${fmtDateOnly(billingPeriodEnd)}`,
      source: "Provider direct" as UsageValueSource,
      status,
    }));

    const response: RailwayUsageResponse = {
      provider: "railway",
      available: true,
      error: null,
      date_range: { preset: "custom", start: range.start, end: range.end },
      current_plan: currentPlanDisplay,
      current_plan_source: currentPlanSource,
      billing_period_start: billingPeriodStart,
      billing_period_end: billingPeriodEnd,
      billing_period_source: customer?.billingPeriod ? "Provider direct" : "Calculated estimate",
      current_usage_usd: currentUsageUsd,
      current_usage_source: currentUsageUsd != null ? "Provider direct" : "Unavailable from provider",
      estimated_usage_usd: estimatedUsageUsd,
      estimated_usage_source: estimatedUsageUsd != null ? "Calculated estimate" : "Unavailable from provider",
      usage_limit_usd: effectiveUsageLimit,
      usage_limit_source:
        usageLimit != null ? "Configured manually" : providerLimitUsd != null ? "Provider direct" : "Unavailable from provider",
      remaining_quota_usd: remainingQuota,
      remaining_quota_source:
        effectiveUsageLimit != null && currentUsageUsd != null ? "Calculated estimate" : "Unavailable from provider",
      active_project: { id: project?.id || projectId, name: project?.name || null },
      active_service: serviceId
        ? {
            id: serviceId,
            name: services.find((service) => service.id === serviceId)?.name || serviceId,
          }
        : null,
      service_breakdown: serviceBreakdown,
      rows: [...aggregateRows, ...metricRows].sort((a, b) => (a.date === b.date ? a.metric_type.localeCompare(b.metric_type) : a.date.localeCompare(b.date))),
      status,
      usage_percent: percent,
      data_source: {
        provider: "railway",
        available: true,
        source: currentUsageUsd != null ? "Provider direct" : "Calculated estimate",
        notes: [
          "Project and service usage are fetched from Railway GraphQL on the backend.",
          configuredPlan
            ? "Current plan is configured manually from RAILWAY_PLAN_NAME (overrides workspace plan from the API)."
            : planFromApi
              ? "Current plan comes from the Railway workspace subscription (HOBBY / PRO / FREE)."
              : "Current plan is unavailable from provider and can be set with RAILWAY_PLAN_NAME.",
          usageLimit != null
            ? "Usage limit / quota is configured manually from RAILWAY_USAGE_LIMIT (overrides the workspace usage limit from the API)."
            : providerLimitUsd != null
              ? "Usage limit / quota comes from the Railway workspace customer usage limit."
              : "Usage limit / quota is unavailable until you set RAILWAY_USAGE_LIMIT or Railway returns a limit for this workspace.",
          estimatedUsageUsd != null
            ? "Estimated usage is a calculated projection using the current billing-period spend trend."
            : "Estimated usage is unavailable from provider and could not be projected.",
          ...notes,
        ],
      },
      last_synced_at: nowIso,
    };

    setCached(cacheKey, response);
    return response;
  } catch (error) {
    const raw = error instanceof Error ? error.message : "Failed to fetch Railway usage.";
    const message = explainRailwayFailure(raw);
    const unavailable: RailwayUsageResponse = {
      provider: "railway",
      available: false,
      error: message,
      date_range: { preset: "custom", start: range.start, end: range.end },
      current_plan: configuredPlan,
      current_plan_source: configuredPlan ? "Configured manually" : "Unavailable from provider",
      billing_period_start: monthRange.start,
      billing_period_end: monthRange.end,
      billing_period_source: "Calculated estimate",
      current_usage_usd: null,
      current_usage_source: "Unavailable from provider",
      estimated_usage_usd: null,
      estimated_usage_source: "Unavailable from provider",
      usage_limit_usd: usageLimit,
      usage_limit_source: valueSourceFromLimit(usageLimit),
      remaining_quota_usd: null,
      remaining_quota_source: "Unavailable from provider",
      active_project: { id: projectId, name: null },
      active_service: serviceId ? { id: serviceId, name: serviceId } : null,
      service_breakdown: [],
      rows: [],
      status: "Healthy",
      usage_percent: null,
      data_source: {
        provider: "railway",
        available: false,
        source: "Unavailable from provider",
        notes: [
          "Railway usage data is fetched server-side only via Railway GraphQL.",
          message,
        ],
      },
      last_synced_at: nowIso,
    };
    setCached(cacheKey, unavailable, 60_000);
    return unavailable;
  }
}
