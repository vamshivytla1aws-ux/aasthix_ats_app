import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  APP_ROLES,
  BOARD_PERMISSION_KEYS,
  getEffectivePermissions,
  normalizeRole,
  requireWorkspaceOwner,
} from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";
import { baselineForRole } from "@/lib/rbac";
import { PERMISSION_CATALOG } from "@/lib/permissionCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireWorkspaceOwner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const usersRes = await query(
      `SELECT id, full_name, email, role, COALESCE(access_scope, 'own') AS access_scope,
              COALESCE(is_active, true) AS is_active, deactivated_at
       FROM users ORDER BY created_at ASC, id ASC`
    );
    const permsRes = await query(
      `SELECT user_id, permission_key, allowed FROM user_permissions
       WHERE permission_key = ANY($1::text[])`,
      [BOARD_PERMISSION_KEYS]
    );

    const explicitByUser = new Map<number, Map<string, boolean>>();
    for (const p of permsRes.rows as Array<{ user_id: number; permission_key: string; allowed: boolean }>) {
      const uid = Number(p.user_id);
      if (!explicitByUser.has(uid)) explicitByUser.set(uid, new Map());
      explicitByUser.get(uid)!.set(p.permission_key, Boolean(p.allowed));
    }

    const users = (
      usersRes.rows as Array<{ id: number; full_name: string; email: string; role: string }>
    ).map((u) => {
      const explicit = explicitByUser.get(u.id) ?? new Map<string, boolean>();
      const role = normalizeRole(u.role);
      const permissions = getEffectivePermissions(u.role, explicit);
      const baseline = baselineForRole(role);
      const explicitPermissions = Object.fromEntries(explicit);
      const permissionSources = Object.fromEntries(
        BOARD_PERMISSION_KEYS.map((key) => [key, role === "workspace_owner" ? "owner" : explicit.has(key) ? "override" : "role_template"]),
      );
      return {
        ...u,
        role,
        permissions,
        explicit_permissions: explicitPermissions,
        baseline_permissions: baseline,
        permission_sources: permissionSources,
      };
    });

    return NextResponse.json({ users, permission_keys: BOARD_PERMISSION_KEYS, permission_catalog: PERMISSION_CATALOG, roles: APP_ROLES });
  } catch (error) {
    console.error("Error fetching user permissions", error);
    return NextResponse.json({ error: "Failed to fetch user permissions" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireWorkspaceOwner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { user_id, role, permissions, access_scope, is_active, revoke_sessions } = body as {
      user_id?: number;
      role?: string;
      permissions?: Record<string, boolean>;
      access_scope?: "own" | "team" | "all";
      is_active?: boolean;
      revoke_sessions?: boolean;
    };

    if (!user_id || !Number.isFinite(Number(user_id))) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const uid = Number(user_id);
    const targetRes = await query(`SELECT id, role, email, COALESCE(is_active, true) AS is_active FROM users WHERE id=$1`, [uid]);
    if (!targetRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const target = targetRes.rows[0] as { role: string; email: string; is_active: boolean };
    if (uid === auth.access.user_id && is_active === false) {
      return NextResponse.json({ error: "You cannot deactivate your own owner account" }, { status: 409 });
    }

    if (role !== undefined) {
      const r = String(role).toLowerCase();
      if (!(APP_ROLES as readonly string[]).includes(r)) {
        return NextResponse.json(
          { error: `role must be one of: ${APP_ROLES.join(", ")}` },
          { status: 400 }
        );
      }
      if (r === "workspace_owner" && uid !== auth.access.user_id) {
        return NextResponse.json({ error: "Use the protected owner-transfer workflow to assign workspace ownership" }, { status: 409 });
      }
      if (target.role === "workspace_owner" && r !== "workspace_owner") {
        return NextResponse.json({ error: "The final workspace owner cannot be demoted" }, { status: 409 });
      }
      await query(`UPDATE users SET role = $2 WHERE id = $1`, [uid, r]);
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "rbac.role_updated",
        metadata: { target_user_id: uid, role: r },
      });
    }

    if (access_scope !== undefined) {
      if (!["own", "team", "all"].includes(access_scope)) return NextResponse.json({ error: "Invalid access scope" }, { status: 400 });
      await query(`UPDATE users SET access_scope=$2 WHERE id=$1`, [uid, access_scope]);
      await writeAuditLog({ actorUserId: auth.access.user_id, action: "rbac.scope_updated", metadata: { target_user_id: uid, access_scope } });
    }

    if (is_active !== undefined) {
      await query(`UPDATE users SET is_active=$2, deactivated_at=CASE WHEN $2 THEN NULL ELSE NOW() END, token_version=CASE WHEN $2 THEN token_version ELSE token_version+1 END WHERE id=$1`, [uid, Boolean(is_active)]);
      await writeAuditLog({ actorUserId: auth.access.user_id, action: is_active ? "rbac.user_reactivated" : "rbac.user_deactivated", metadata: { target_user_id: uid } });
    }

    if (revoke_sessions) {
      await query(`UPDATE users SET token_version=token_version+1 WHERE id=$1`, [uid]);
      await writeAuditLog({ actorUserId: auth.access.user_id, action: "rbac.sessions_revoked", metadata: { target_user_id: uid } });
    }

    if (permissions && typeof permissions === "object") {
      const keys = Object.keys(permissions).filter((k) =>
        BOARD_PERMISSION_KEYS.includes(k as (typeof BOARD_PERMISSION_KEYS)[number])
      );
      for (const key of keys) {
        await query(
          `
          INSERT INTO user_permissions (user_id, permission_key, allowed)
          VALUES ($1, $2, $3)
          ON CONFLICT (user_id, permission_key)
          DO UPDATE SET allowed = EXCLUDED.allowed, updated_at = NOW()
          `,
          [uid, key, Boolean(permissions[key])]
        );
      }
      if (keys.length) {
        await writeAuditLog({
          actorUserId: auth.access.user_id,
          action: "rbac.permissions_updated",
          metadata: { target_user_id: uid, keys },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating user permissions", error);
    return NextResponse.json({ error: "Failed to update user permissions" }, { status: 500 });
  }
}
