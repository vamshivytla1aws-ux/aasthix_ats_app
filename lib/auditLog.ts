import { query } from "@/lib/db";

export type AuditAction =
  | "auth.login"
  | "auth.logout"
  | "auth.signup"
  | "auth.invite.created"
  | "auth.invite.accepted"
  | "rbac.role_updated"
  | "rbac.permissions_updated";

export async function writeAuditLog(params: {
  actorUserId: number | null;
  action: AuditAction | string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await query(
      `INSERT INTO app_audit_events (actor_user_id, action, metadata)
       VALUES ($1, $2, $3::jsonb)`,
      [params.actorUserId, params.action, JSON.stringify(params.metadata ?? {})]
    );
  } catch (e) {
    console.error("writeAuditLog failed", e);
  }
}
