import type { HrAssistantPlan, HrQueryResult } from "./types";

export function summarizeQueryResult(plan: HrAssistantPlan, result: HrQueryResult): string {
  const n = result.rows.length;

  if (result.entity === "analytics" && result.columns.includes("total")) {
    const row = result.rows[0] as { metric?: string; total?: number } | undefined;
    const total = row?.total ?? 0;
    const metric = row?.metric ?? "records";
    const suffix = result.verification?.verified
      ? " [Verified]"
      : result.verification?.warning
        ? " [Verification warning]"
        : "";
    return `Total **${total}** ${metric.replace(/_/g, " ")} (${plan.intent_summary}).${suffix}`;
  }

  if (result.entity === "analytics" && result.columns.includes("stage")) {
    return `Stage breakdown — **${n}** stage rows (${plan.intent_summary}).`;
  }

  if (result.entity === "analytics" && result.columns.includes("week_start")) {
    return `Weekly trend — **${n}** buckets (${plan.intent_summary}).`;
  }

  if (result.entity === "analytics" && result.columns.includes("board")) {
    return `Cross-board snapshot (${plan.intent_summary}) — **${n}** areas you can access.`;
  }

  const label = plan.entity ?? "records";
  if (n === 0) {
    return `No ${label} matched your filters. Try broader keywords, different dates, or fewer constraints.`;
  }
  const cap = n >= 50 ? " (capped at 50 rows)" : "";
  return `Here are **${n}** ${label}${cap}.`;
}
