/**
 * Requisition / JD lifecycle — stored on `jobs.status` (free text, PATCH-supported).
 * Maps legacy "Open" / "Closed" into the workflow; you can set any label via job edit or PATCH.
 */

export const REQUISITION_WORKFLOW_STEPS = [
  "Draft",
  "Pending Approval",
  "Open",
  "On Hold",
  "Filled",
  "Closed",
] as const;

export type RequisitionWorkflowStep = (typeof REQUISITION_WORKFLOW_STEPS)[number];

export function normalizeRequisitionStep(raw: string | null | undefined): RequisitionWorkflowStep {
  const s = (raw || "").trim();
  const lower = s.toLowerCase();
  if (!s) return "Open";
  if (lower === "open") return "Open";
  if (lower === "closed") return "Closed";
  if (lower.includes("draft")) return "Draft";
  if (lower.includes("pending") || lower.includes("approval")) return "Pending Approval";
  if (lower.includes("hold")) return "On Hold";
  if (lower.includes("filled") || lower.includes("complete")) return "Filled";
  // Preserve exact match if already a known step
  const exact = REQUISITION_WORKFLOW_STEPS.find((x) => x.toLowerCase() === lower);
  if (exact) return exact;
  return "Open";
}

export function nextRequisitionStep(current: RequisitionWorkflowStep): RequisitionWorkflowStep | null {
  const i = REQUISITION_WORKFLOW_STEPS.indexOf(current);
  if (i < 0 || i >= REQUISITION_WORKFLOW_STEPS.length - 1) return null;
  return REQUISITION_WORKFLOW_STEPS[i + 1];
}

export function stepIndex(step: RequisitionWorkflowStep): number {
  return REQUISITION_WORKFLOW_STEPS.indexOf(step);
}
