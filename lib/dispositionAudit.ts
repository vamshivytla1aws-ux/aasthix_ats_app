import { query } from "@/lib/db";

export type DispositionCategory = "reject" | "withdraw" | "job_close";

export { jobStatusRequiresDispositionReason } from "@/lib/dispositionRules";

export async function validateDispositionReason(
  reasonId: number,
  allowedCategories: DispositionCategory[]
): Promise<{ ok: true; label: string; category: string } | { ok: false; error: string }> {
  if (!Number.isFinite(reasonId) || reasonId <= 0) {
    return { ok: false, error: "disposition_reason_id must be a positive number" };
  }
  const res = await query(
    `SELECT id, label, category, active FROM disposition_reasons WHERE id = $1 LIMIT 1`,
    [reasonId]
  );
  if (res.rowCount === 0) return { ok: false, error: "Invalid disposition reason" };
  const row = res.rows[0] as { id: number; label: string; category: string; active: boolean };
  if (!row.active) return { ok: false, error: "Disposition reason is inactive" };
  if (!allowedCategories.includes(row.category as DispositionCategory)) {
    return { ok: false, error: "Selected reason does not apply to this action" };
  }
  return { ok: true, label: row.label, category: row.category };
}

export async function recordDispositionEvent(opts: {
  userId: number;
  entityType: "application" | "job";
  entityId: number;
  reasonId: number;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `
    INSERT INTO disposition_events (user_id, entity_type, entity_id, disposition_reason_id, notes, metadata)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `,
    [
      opts.userId,
      opts.entityType,
      opts.entityId,
      opts.reasonId,
      opts.notes ?? null,
      JSON.stringify(opts.metadata ?? {}),
    ]
  );
}
