import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  APP_ROLES,
  BOARD_PERMISSION_KEYS,
  getEffectivePermissions,
  normalizeRole,
  requireAdmin,
} from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const usersRes = await query(
      `SELECT id, full_name, email, role FROM users ORDER BY created_at ASC, id ASC`
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
      return {
        ...u,
        role,
        permissions,
      };
    });

    return NextResponse.json({ users, permission_keys: BOARD_PERMISSION_KEYS, roles: APP_ROLES });
  } catch (error) {
    console.error("Error fetching user permissions", error);
    return NextResponse.json({ error: "Failed to fetch user permissions" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await request.json();
    const { user_id, role, permissions } = body as {
      user_id?: number;
      role?: string;
      permissions?: Record<string, boolean>;
    };

    if (!user_id || !Number.isFinite(Number(user_id))) {
      return NextResponse.json({ error: "user_id is required" }, { status: 400 });
    }

    const uid = Number(user_id);

    if (role !== undefined) {
      const r = String(role).toLowerCase();
      if (!(APP_ROLES as readonly string[]).includes(r)) {
        return NextResponse.json(
          { error: `role must be one of: ${APP_ROLES.join(", ")}` },
          { status: 400 }
        );
      }
      await query(`UPDATE users SET role = $2 WHERE id = $1`, [uid, r]);
      await writeAuditLog({
        actorUserId: auth.access.user_id,
        action: "rbac.role_updated",
        metadata: { target_user_id: uid, role: r },
      });
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
