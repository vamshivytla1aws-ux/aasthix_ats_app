import type { HrQueryResult, HrQuickAction } from "./types";

export function buildQuickActionsFromResult(result: HrQueryResult): HrQuickAction[] {
  const actions: HrQuickAction[] = [];
  if (
    result.entity !== "applications" &&
    result.entity !== "interviews" &&
    result.entity !== "offers"
  ) {
    return actions;
  }

  const seen = new Set<number>();
  for (const row of result.rows.slice(0, 10)) {
    const aid = Number(row.application_id);
    if (!Number.isFinite(aid) || seen.has(aid)) continue;
    seen.add(aid);
    const stage = String(row.stage || "");
    const name = String(row.candidate_name || "Candidate").slice(0, 40);

    if (stage !== "Interview" && stage !== "Selected") {
      actions.push({
        id: `mv-int-${aid}`,
        label: `Interview: ${name}`,
        action: { type: "move_stage", application_id: aid, new_stage: "Interview" },
      });
    }
    actions.push({
      id: `sch-${aid}`,
      label: `Schedule: ${name}`,
      action: { type: "schedule_interview", application_id: aid },
    });
  }

  return actions.slice(0, 14);
}
