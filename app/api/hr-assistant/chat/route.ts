import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { parseUserIntent } from "@/lib/hrAssistant/aiService";
import { runHrQuery } from "@/lib/hrAssistant/queryEngine";
import { executeHrAction } from "@/lib/hrAssistant/actionExecutor";
import { buildQuickActionsFromResult } from "@/lib/hrAssistant/quickActions";
import { summarizeQueryResult } from "@/lib/hrAssistant/formatReply";
import type { HrAssistantPlan, HrDirectAction, HrEntity } from "@/lib/hrAssistant/types";
import { alignPlanWithUserMessage } from "@/lib/hrAssistant/planNormalize";
import { applyRelativeDatesFromMessage } from "@/lib/hrAssistant/relativeDates";
import { applyStrictMetricPolicy } from "@/lib/hrAssistant/policy";
import { buildStructuredContextFromHistory } from "@/lib/hrAssistant/conversationContext";
import { enrichQueryReply } from "@/lib/hrAssistant/enrichReply";
import { checkHrAssistantRateLimit } from "@/lib/hrAssistant/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 24;
const MAX_MESSAGE_LEN = 4000;
const RATE_MAX = 45;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function canQueryEntity(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, entity: HrEntity | null) {
  if (access.role === "admin") return true;
  if (!entity || entity === "analytics") return access.permissions["dashboard.view"] !== false;
  if (entity === "candidates") return access.permissions["candidates.view"] !== false;
  if (entity === "jobs") return access.permissions["jobs.view"] !== false;
  if (entity === "applications" || entity === "interviews" || entity === "offers") {
    return access.permissions["pipeline.view"] !== false;
  }
  return true;
}

function canRunAction(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, action: HrDirectAction) {
  if (access.role === "admin") return true;
  if (action.type === "move_stage" || action.type === "schedule_interview") {
    return access.permissions["pipeline.manage"] !== false;
  }
  if (action.type === "update_job_status" || action.type === "add_job_team_member") {
    return access.permissions["jobs.manage"] !== false;
  }
  return false;
}

async function loadHistory(userId: number) {
  try {
    const res = await query(
      `
      SELECT role, content, created_at
      FROM hr_assistant_messages
      WHERE user_id = $1
      ORDER BY id DESC
      LIMIT $2
      `,
      [userId, MAX_HISTORY]
    );
    const rows = res.rows as Array<{ role: string; content: Record<string, unknown>; created_at: string }>;
    return rows.reverse();
  } catch {
    return [];
  }
}

async function persistMessage(userId: number, role: "user" | "assistant", content: Record<string, unknown>) {
  try {
    await query(`INSERT INTO hr_assistant_messages (user_id, role, content) VALUES ($1, $2, $3::jsonb)`, [
      userId,
      role,
      JSON.stringify(content),
    ]);
  } catch (e) {
    console.error("hr_assistant persistMessage", e);
  }
}

function historyForModel(
  rows: Array<{ role: string; content: Record<string, unknown> }>
): { role: "user" | "assistant"; text: string }[] {
  const out: { role: "user" | "assistant"; text: string }[] = [];
  for (const r of rows) {
    if (r.role !== "user" && r.role !== "assistant") continue;
    const text =
      r.role === "user"
        ? String((r.content as { text?: string }).text || "")
        : String((r.content as { text?: string }).text || "");
    if (!text) continue;
    out.push({ role: r.role, text });
  }
  return out.slice(-10);
}

function trimRowsForStore(rows: Record<string, unknown>[], max = 12) {
  return rows.slice(0, max);
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission("dashboard.view");
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const access = auth.access;

    const body = (await request.json()) as { message?: string; action?: HrDirectAction };
    const directAction = body.action;

    if (directAction?.type) {
      const rl = checkHrAssistantRateLimit(access.user_id, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
      if (!rl.ok) {
        return NextResponse.json(
          { error: `Too many requests. Try again in ${rl.retryAfterSec}s.` },
          { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
        );
      }
      if (!canRunAction(access, directAction)) {
        return NextResponse.json({ error: "You do not have permission for this action." }, { status: 403 });
      }
      const result = await executeHrAction(access, directAction);
      const text = result.ok ? result.message : `Could not complete action: ${result.error}`;
      await persistMessage(access.user_id, "user", {
        text: `[Quick action] ${directAction.type}`,
        action: directAction,
      });
      await persistMessage(access.user_id, "assistant", {
        text,
        error: result.ok ? undefined : result.error,
      });
      return NextResponse.json({
        reply: { text, error: result.ok ? undefined : result.error, plan: undefined, result: undefined, quickActions: [] },
      });
    }

    const message = String(body.message || "").trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LEN) {
      return NextResponse.json({ error: `Message too long (max ${MAX_MESSAGE_LEN} characters).` }, { status: 400 });
    }

    const rl = checkHrAssistantRateLimit(access.user_id, { max: RATE_MAX, windowMs: RATE_WINDOW_MS });
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Too many requests. Try again in ${rl.retryAfterSec}s.` },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
      );
    }

    const histRows = await loadHistory(access.user_id);
    const structuredContext = buildStructuredContextFromHistory(histRows);
    await persistMessage(access.user_id, "user", { text: message });
    let plan = await parseUserIntent({
      userMessage: message,
      history: historyForModel(histRows),
      structuredContext,
    });

    if (plan.kind === "query") {
      plan = alignPlanWithUserMessage(plan, message);
      plan = applyStrictMetricPolicy(plan, message);
      plan = applyRelativeDatesFromMessage(plan, message);
    }

    if (plan.needs_clarification && plan.clarification_question) {
      const text = plan.clarification_question;
      await persistMessage(access.user_id, "assistant", { text, plan });
      return NextResponse.json({
        reply: { text, plan, quickActions: [] },
      });
    }

    if (plan.kind === "action" && plan.action?.type) {
      if (!canRunAction(access, plan.action)) {
        const text = "You do not have permission to run that action (pipeline or job management may be disabled).";
        await persistMessage(access.user_id, "assistant", { text, plan });
        return NextResponse.json({ reply: { text, plan, quickActions: [] } });
      }
      const result = await executeHrAction(access, plan.action);
      const text = result.ok ? result.message : `Could not complete action: ${result.error}`;
      await persistMessage(access.user_id, "assistant", { text, plan, error: result.ok ? undefined : result.error });
      return NextResponse.json({
        reply: {
          text,
          plan,
          error: result.ok ? undefined : result.error,
          quickActions: [],
        },
      });
    }

    let effectivePlan: HrAssistantPlan = plan;
    if (plan.analytics?.metric === "board_totals" && plan.entity !== "analytics") {
      effectivePlan = { ...plan, entity: "analytics" };
    }
    if (effectivePlan.entity === "analytics" && !effectivePlan.analytics) {
      effectivePlan = { ...effectivePlan, analytics: { metric: "count" } };
    }

    if (!canQueryEntity(access, effectivePlan.entity)) {
      const text = "You do not have permission to view that data.";
      await persistMessage(access.user_id, "assistant", { text, plan: effectivePlan });
      return NextResponse.json({ reply: { text, plan: effectivePlan, quickActions: [] } });
    }

    if (!effectivePlan.entity && effectivePlan.kind === "query" && !effectivePlan.analytics) {
      const text =
        "I am not sure what to search. Try: “candidates in Hyderabad with React”, “open jobs”, “applications in interview”, “hiring summary across boards”, or “count applications by stage”.";
      await persistMessage(access.user_id, "assistant", { text, plan: effectivePlan });
      return NextResponse.json({ reply: { text, plan: effectivePlan, quickActions: [] } });
    }

    try {
      const result = await runHrQuery(access, effectivePlan);
      const text = summarizeQueryResult(effectivePlan, result);
      const quickActions = buildQuickActionsFromResult(result);
      const enriched = enrichQueryReply(effectivePlan, result);
      const persistPayload = {
        text,
        plan: effectivePlan,
        display: {
          columns: result.columns,
          rows: trimRowsForStore(result.rows, 50),
          entity: result.entity,
        },
        quickActions,
        insights: enriched.insights,
        suggestedFollowUps: enriched.suggestedFollowUps,
        relatedLinks: enriched.relatedLinks,
        chartSeries: enriched.chartSeries,
        verification: result.verification,
      };
      await persistMessage(access.user_id, "assistant", persistPayload);
      return NextResponse.json({
        reply: {
          text,
          plan: effectivePlan,
          result: {
            columns: result.columns,
            rows: result.rows,
            entity: result.entity,
          },
          quickActions,
          insights: enriched.insights,
          suggestedFollowUps: enriched.suggestedFollowUps,
          relatedLinks: enriched.relatedLinks,
          chartSeries: enriched.chartSeries,
          verification: result.verification,
        },
      });
    } catch (qe) {
      console.error("hrAssistant query", qe);
      const text =
        "That query could not be completed against the database. If this persists, check server logs and ensure migrations are applied.";
      await persistMessage(access.user_id, "assistant", { text, plan: effectivePlan });
      return NextResponse.json({
        reply: { text, plan: effectivePlan, error: String((qe as Error)?.message || qe), quickActions: [] },
      });
    }
  } catch (e) {
    console.error("hr-assistant POST", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
