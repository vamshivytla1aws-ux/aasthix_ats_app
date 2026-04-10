import { query } from "@/lib/db";
import { requireAuthUser } from "@/lib/authServer";
import { APP_ROLES as APP_ROLES_CONST, INVITE_ROLES as INVITE_ROLES_CONST } from "@/lib/rbacConstants";

export const BOARD_PERMISSION_KEYS = [
  "dashboard.view",
  "candidates.view",
  "candidates.manage",
  "jobs.view",
  "jobs.manage",
  "pipeline.view",
  "pipeline.manage",
  "interviews.view",
  "interviews.manage",
  "vendors.view",
  "vendors.manage",
  "alerts.view",
  "approvals.manage",
  "hiring_manager.view",
  "recruiter.view",
  "coordinator.view",
  "chat.view",
] as const;

export type BoardPermissionKey = (typeof BOARD_PERMISSION_KEYS)[number];

export const APP_ROLES = APP_ROLES_CONST;
export type AppRole = (typeof APP_ROLES)[number];

export const INVITE_ROLES = INVITE_ROLES_CONST;
export type InviteRole = (typeof INVITE_ROLES)[number];

export type AuthAccess = {
  user_id: number;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
};

function allFalse(): Record<BoardPermissionKey, boolean> {
  return Object.fromEntries(BOARD_PERMISSION_KEYS.map((k) => [k, false])) as Record<
    BoardPermissionKey,
    boolean
  >;
}

function mergeBaseline(partial: Partial<Record<BoardPermissionKey, boolean>>): Record<BoardPermissionKey, boolean> {
  const b = allFalse();
  for (const k of BOARD_PERMISSION_KEYS) {
    if (k in partial) b[k] = Boolean(partial[k]);
  }
  return b;
}

/** Default access for new `user` role (overridable by explicit user_permissions rows). */
const BASELINE_USER = mergeBaseline({
  "dashboard.view": true,
  "candidates.view": true,
  "jobs.view": true,
  "alerts.view": true,
  "chat.view": true,
});

const BASELINE_RECRUITER = mergeBaseline({
  "dashboard.view": true,
  "candidates.view": true,
  "candidates.manage": true,
  "jobs.view": true,
  "jobs.manage": true,
  "pipeline.view": true,
  "pipeline.manage": true,
  "interviews.view": true,
  "interviews.manage": true,
  "vendors.view": true,
  "alerts.view": true,
  "recruiter.view": true,
  "chat.view": true,
});

const BASELINE_HIRING_MANAGER = mergeBaseline({
  "dashboard.view": true,
  "candidates.view": true,
  "jobs.view": true,
  "pipeline.view": true,
  "interviews.view": true,
  "vendors.view": true,
  "alerts.view": true,
  "hiring_manager.view": true,
  "chat.view": true,
});

const BASELINE_COORDINATOR = mergeBaseline({
  "dashboard.view": true,
  "pipeline.view": true,
  "pipeline.manage": true,
  "interviews.view": true,
  "interviews.manage": true,
  "alerts.view": true,
  "coordinator.view": true,
  "chat.view": true,
});

export function baselineForRole(role: string): Record<BoardPermissionKey, boolean> {
  switch (role) {
    case "admin": {
      const b = allFalse();
      for (const k of BOARD_PERMISSION_KEYS) b[k] = true;
      return b;
    }
    case "recruiter":
      return BASELINE_RECRUITER;
    case "hiring_manager":
      return BASELINE_HIRING_MANAGER;
    case "coordinator":
      return BASELINE_COORDINATOR;
    default:
      return BASELINE_USER;
  }
}

/** Normalize DB role string to canonical role id. */
export function normalizeRole(role: string | null | undefined): string {
  const r = (role || "user").trim().toLowerCase();
  if (r === "admin" || r === "administrator") return "admin";
  if (r === "recruiter") return "recruiter";
  if (r === "hiring_manager") return "hiring_manager";
  if (r === "coordinator") return "coordinator";
  return "user";
}

/**
 * Effective permissions = role baseline, then explicit user_permissions override when present.
 */
export function getEffectivePermissions(
  roleRaw: string | null | undefined,
  explicit: Map<string, boolean>
): Record<string, boolean> {
  const role = normalizeRole(roleRaw);
  const permissions: Record<string, boolean> = {};
  for (const key of BOARD_PERMISSION_KEYS) {
    if (role === "admin") {
      permissions[key] = true;
      continue;
    }
    const base = baselineForRole(role)[key] ?? false;
    permissions[key] = explicit.has(key) ? Boolean(explicit.get(key)) : base;
  }
  return permissions;
}

export async function getAuthAccess() {
  const auth = await requireAuthUser();
  if (!auth) return null;

  const userRes = await query(
    `SELECT id, email, role FROM users WHERE id = $1 LIMIT 1`,
    [auth.user_id]
  );
  if (userRes.rowCount === 0) return null;

  const row = userRes.rows[0] as { id: number; email: string; role: string | null };
  const role = normalizeRole(row.role);

  const explicit = new Map<string, boolean>();
  try {
    const permRes = await query(
      `SELECT permission_key, allowed FROM user_permissions WHERE user_id = $1`,
      [auth.user_id]
    );
    for (const r of permRes.rows as Array<{ permission_key: string; allowed: boolean }>) {
      explicit.set(r.permission_key, Boolean(r.allowed));
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? (error as { code?: unknown }).code : undefined;
    if (code !== "42P01" && code !== "42703") throw error;
    console.warn("[rbac] user_permissions table unavailable; falling back to role baseline", error);
  }

  const permissions = getEffectivePermissions(row.role, explicit);

  return {
    user_id: row.id,
    email: row.email,
    role,
    permissions,
  } satisfies AuthAccess;
}

export async function requireAdmin() {
  const access = await getAuthAccess();
  if (!access) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (access.role !== "admin") return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, access };
}

export async function requirePermission(permissionKey: BoardPermissionKey) {
  const access = await getAuthAccess();
  if (!access) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (access.role === "admin") return { ok: true as const, access };
  if (!access.permissions[permissionKey]) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, access };
}
