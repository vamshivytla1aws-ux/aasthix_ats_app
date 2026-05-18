import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, requirePermission } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const res = await query(
      `SELECT retention_days, allow_message_edit, allow_message_delete, allow_export, max_file_size_mb, allowed_mime_categories, updated_by, updated_at
       FROM chat_policies
       ORDER BY id DESC
       LIMIT 1`
    );
    return NextResponse.json({
      policy:
        res.rows[0] ??
        {
          retention_days: 365,
          allow_message_edit: true,
          allow_message_delete: true,
          allow_export: false,
          max_file_size_mb: 10,
          allowed_mime_categories: ["image", "document", "archive"],
        },
    });
  } catch (error) {
    console.error("chat/policies GET", error);
    return NextResponse.json({ error: "Failed to load chat policy" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const access = gate.access;

    const body = await request.json();
    const retentionDays = Math.max(30, Number(body?.retention_days || 365));
    const allowEdit = body?.allow_message_edit !== false;
    const allowDelete = body?.allow_message_delete !== false;
    const allowExport = Boolean(body?.allow_export);
    const maxFileSizeMb = Math.max(1, Number(body?.max_file_size_mb || 10));
    const allowedMimeCategories = Array.isArray(body?.allowed_mime_categories)
      ? body.allowed_mime_categories.map((v: unknown) => String(v))
      : ["image", "document", "archive"];

    await query(
      `UPDATE chat_policies
       SET retention_days = $1,
           allow_message_edit = $2,
           allow_message_delete = $3,
           allow_export = $4,
           max_file_size_mb = $5,
           allowed_mime_categories = $6::text[],
           updated_by = $7,
           updated_at = NOW()
       WHERE id = (SELECT id FROM chat_policies ORDER BY id DESC LIMIT 1)`,
      [retentionDays, allowEdit, allowDelete, allowExport, maxFileSizeMb, allowedMimeCategories, access.user_id]
    );

    await writeAuditLog({
      actorUserId: access.user_id,
      action: "chat.policy.updated",
      metadata: { retention_days: retentionDays, max_file_size_mb: maxFileSizeMb },
    });

    return NextResponse.json({
      operation_status: "success",
      user_message: "Chat policy updated.",
    });
  } catch (error) {
    console.error("chat/policies PUT", error);
    return NextResponse.json({ error: "Failed to update chat policy" }, { status: 500 });
  }
}

