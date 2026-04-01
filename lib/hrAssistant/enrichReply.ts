import type { HrAssistantPlan, HrQueryResult } from "./types";

export type RelatedLink = { label: string; href: string };

export type ChartPoint = { name: string; value: number };

export type EnrichedReplyMeta = {
  insights: string | null;
  suggestedFollowUps: string[];
  relatedLinks: RelatedLink[];
  chartSeries: ChartPoint[] | null;
};

function topAnalyticsRow(result: HrQueryResult): Record<string, unknown> | null {
  if (!result.rows.length) return null;
  if (result.columns.includes("count")) {
    const idx = result.columns.indexOf("count");
    const key = result.columns[idx];
    return [...result.rows].sort((a, b) => Number(b[key]) - Number(a[key]))[0] ?? null;
  }
  if (result.columns.includes("applications_count")) {
    const key = "applications_count";
    return [...result.rows].sort((a, b) => Number(b[key]) - Number(a[key]))[0] ?? null;
  }
  return null;
}

export function buildChartSeries(result: HrQueryResult): ChartPoint[] | null {
  if (result.entity !== "analytics" || !result.rows.length) return null;
  if (result.columns.includes("stage") && result.columns.includes("count")) {
    return result.rows.map((r) => ({
      name: String(r.stage ?? "—").slice(0, 24),
      value: Number(r.count) || 0,
    }));
  }
  if (result.columns.includes("board") && result.columns.includes("count")) {
    return result.rows.map((r) => ({
      name: String(r.board ?? "—").slice(0, 28),
      value: Number(r.count) || 0,
    }));
  }
  if (result.columns.includes("week_start") && result.columns.includes("applications_count")) {
    return result.rows.map((r) => ({
      name: String(r.week_start ?? "—").slice(0, 12),
      value: Number(r.applications_count) || 0,
    }));
  }
  return null;
}

export function enrichQueryReply(plan: HrAssistantPlan, result: HrQueryResult): EnrichedReplyMeta {
  const n = result.rows.length;
  const chartSeries = buildChartSeries(result);
  const suggestedFollowUps: string[] = [];
  const relatedLinks: RelatedLink[] = [];
  let insights: string | null = null;

  if (result.entity === "analytics") {
    if (result.columns.includes("stage") && result.columns.includes("count") && n > 0) {
      const top = topAnalyticsRow(result);
      if (top && "stage" in top && "count" in top) {
        insights = `Peak pipeline stage right now: **${top.stage}** (${top.count} applications).`;
      }
      suggestedFollowUps.push("Show weekly application trend", "Executive summary across all boards");
    } else if (result.columns.includes("board") && result.columns.includes("count")) {
      insights =
        n > 0
          ? "Snapshot reflects only areas your role can access."
          : "No board metrics returned — check permissions or add data.";
      suggestedFollowUps.push("Break down applications by stage", "List open jobs");
    } else if (result.columns.includes("week_start")) {
      insights = n > 1 ? "Trend uses application **created** dates per week (UTC)." : null;
      suggestedFollowUps.push("How many applications total?", "Candidates in interview stage");
    } else if (result.columns.includes("total")) {
      const row = result.rows[0] as { metric?: string; total?: number } | undefined;
      if (row?.total != null) {
        insights = `Counted **${row.total}** ${String(row.metric ?? "records").replace(/_/g, " ")}.`;
      }
      suggestedFollowUps.push("Show me the underlying list", "Group applications by stage");
    }
    relatedLinks.push({ label: "Analytics", href: "/analytics" });
  }

  if (result.entity === "candidates" && n > 0) {
    insights = insights ?? `**${n}** candidate profile(s) — refine with location or skills.`;
    suggestedFollowUps.push("How many total match this filter?", "Show jobs that need Java");
    relatedLinks.push({ label: "Candidates", href: "/candidates" });
  }

  if (result.entity === "jobs" && n > 0) {
    insights = insights ?? `**${n}** requisition(s) in view.`;
    suggestedFollowUps.push("Count open jobs", "Applications for these roles");
    relatedLinks.push({ label: "Jobs", href: "/jobs" });
  }

  if (
    result.entity === "applications" ||
    result.entity === "interviews" ||
    result.entity === "offers"
  ) {
    if (n > 0) {
      insights = insights ?? `**${n}** pipeline row(s). Use quick actions or open Pipeline for bulk moves.`;
    } else {
      insights = "No rows in scope — try a wider date range or confirm interviews are scheduled in the system.";
    }
    suggestedFollowUps.push("List interviews this month", "Applications by stage breakdown");
    relatedLinks.push({ label: "Pipeline", href: "/pipeline" });
    if (result.entity === "interviews") {
      relatedLinks.push({ label: "Interview desk", href: "/interviews" });
    }
  }

  if (n === 0 && !insights) {
    insights = "Zero rows — broaden filters or verify your team owns those records.";
  }

  const unique = <T,>(arr: T[], key: (x: T) => string) => {
    const seen = new Set<string>();
    return arr.filter((x) => {
      const k = key(x);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  return {
    insights,
    suggestedFollowUps: unique(suggestedFollowUps, (x) => x).slice(0, 5),
    relatedLinks: unique(relatedLinks, (x) => x.href).slice(0, 4),
    chartSeries,
  };
}
