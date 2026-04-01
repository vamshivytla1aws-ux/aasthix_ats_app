import { query } from "@/lib/db";

export type ScreeningAuditEventType =
  | "test_created"
  | "test_resent"
  | "submitted"
  | "stage_override"
  | "reminder_sent"
  | "expired_batch";

export async function logScreeningAudit(input: {
  event_type: ScreeningAuditEventType;
  application_id?: number | null;
  test_id?: number | null;
  candidate_id?: number | null;
  created_by_user_id?: number | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await query(
      `
      INSERT INTO screening_audit_events (
        event_type, application_id, test_id, candidate_id, created_by_user_id, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())
      `,
      [
        input.event_type,
        input.application_id ?? null,
        input.test_id ?? null,
        input.candidate_id ?? null,
        input.created_by_user_id ?? null,
        JSON.stringify(input.metadata || {}),
      ]
    );
  } catch (e: any) {
    if (e?.code === "42P01") return;
    console.error("[screening-audit]", e);
  }
}
