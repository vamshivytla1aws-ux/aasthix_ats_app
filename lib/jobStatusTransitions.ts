/**
 * Canonical job / requisition status state-machine.
 *
 * Modeled after Oracle Recruiting Cloud's requisition lifecycle:
 *   Draft → Pending Approval → Open ⇄ On Hold → Filled / Closed
 *
 * The graph is intentionally permissive for "reopen" paths (Closed → Draft,
 * Filled → Open) so recruiters can correct mistakes without DB surgery, but
 * random jumps (e.g. Draft → Filled) are blocked.
 *
 * Import from server routes only — this file is NOT marked "use client".
 */

import { normalizeRequisitionStep, type RequisitionWorkflowStep } from "./requisitionWorkflow";

// ─── Allowed transitions (from → Set<to>) ──────────────────────────────────

function buildAllowed(): ReadonlyMap<RequisitionWorkflowStep, ReadonlySet<RequisitionWorkflowStep>> {
  const m = new Map<RequisitionWorkflowStep, Set<RequisitionWorkflowStep>>();
  const put = (from: RequisitionWorkflowStep, targets: RequisitionWorkflowStep[]) =>
    m.set(from, new Set(targets));

  put("Draft",            ["Pending Approval", "Open", "Closed"]);
  put("Pending Approval", ["Open", "Draft", "Closed"]);
  put("Open",             ["On Hold", "Filled", "Closed"]);
  put("On Hold",          ["Open", "Closed"]);
  put("Filled",           ["Open", "Closed"]);
  put("Closed",           ["Draft", "Open"]);

  return m;
}

const ALLOWED = buildAllowed();

// ─── Error codes returned to the client ─────────────────────────────────────

export const TRANSITION_ERROR_CODE = "INVALID_STATUS_TRANSITION" as const;

export type TransitionValidationResult =
  | { ok: true; from: RequisitionWorkflowStep; to: RequisitionWorkflowStep }
  | {
      ok: false;
      code: typeof TRANSITION_ERROR_CODE;
      from: RequisitionWorkflowStep;
      to: RequisitionWorkflowStep;
      allowed: RequisitionWorkflowStep[];
      message: string;
    };

/**
 * Validate that `from → to` is an allowed status transition.
 *
 * Both values are normalized via `normalizeRequisitionStep` so callers can pass
 * the raw `jobs.status` string stored in the DB.
 *
 * When `from === to` (no actual change) the function returns `{ ok: true }` so
 * that PATCH payloads that echo the current status are not rejected.
 */
export function validateStatusTransition(
  rawFrom: string,
  rawTo: string
): TransitionValidationResult {
  const from = normalizeRequisitionStep(rawFrom);
  const to = normalizeRequisitionStep(rawTo);

  if (from === to) return { ok: true, from, to };

  const allowed = ALLOWED.get(from);
  if (allowed && allowed.has(to)) {
    return { ok: true, from, to };
  }

  const validTargets = allowed ? Array.from(allowed) : [];

  return {
    ok: false,
    code: TRANSITION_ERROR_CODE,
    from,
    to,
    allowed: validTargets,
    message: `Status transition "${from}" → "${to}" is not allowed. Valid targets from "${from}": ${validTargets.length > 0 ? validTargets.join(", ") : "(none — terminal state)"}`,
  };
}

/**
 * Convenience: list all statuses reachable from the current one.
 * Used by the UI to populate the inline-edit dropdown with only valid targets.
 */
export function allowedTargets(rawCurrent: string): RequisitionWorkflowStep[] {
  const current = normalizeRequisitionStep(rawCurrent);
  const set = ALLOWED.get(current);
  return set ? Array.from(set) : [];
}
