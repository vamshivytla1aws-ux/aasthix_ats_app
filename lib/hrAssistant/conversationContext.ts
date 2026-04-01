import type { HrAssistantPlan } from "./types";

/**
 * Gives the LLM a compact summary of the last assistant turn so follow-ups like
 * "only Bangalore" or "how many was that?" resolve correctly.
 */
export function buildStructuredContextFromHistory(
  rows: Array<{ role: string; content: Record<string, unknown> }>
): string | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i];
    if (r.role !== "assistant") continue;
    const c = r.content as {
      plan?: HrAssistantPlan;
      display?: { entity: string | null; columns: string[]; rows: Record<string, unknown>[] };
    };
    if (!c.plan && !c.display) continue;
    const parts: string[] = [];
    if (c.plan?.entity) parts.push(`last_entity=${c.plan.entity}`);
    if (c.plan?.intent_summary) parts.push(`last_summary=${c.plan.intent_summary.slice(0, 200)}`);
    if (c.plan?.filters && Object.keys(c.plan.filters).length > 0) {
      parts.push(`last_filters=${JSON.stringify(c.plan.filters).slice(0, 500)}`);
    }
    if (c.plan?.analytics?.metric) parts.push(`last_analytics_metric=${c.plan.analytics.metric}`);
    if (c.display?.rows?.length !== undefined) parts.push(`last_rows_returned=${c.display.rows.length}`);
    if (c.display?.entity) parts.push(`last_result_entity=${c.display.entity}`);
    if (parts.length === 0) continue;
    return `${parts.join(". ")}. If the user refers to "those", "them", "that list", or asks to narrow or count, extend last_filters or reuse last_entity.`;
  }
  return undefined;
}
