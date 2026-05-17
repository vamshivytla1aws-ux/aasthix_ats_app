import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { deleteDocument, getDocumentById } from "@/lib/hrms/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canAccessDocument(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>, ownerUserId: number) {
  if (access.role === "admin") return true;
  if (access.permissions["documents.view_all"]) return true;
  if (access.permissions["documents.view_team"]) return true;
  return access.user_id === ownerUserId;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid document id." }, { status: 400 });

  const doc = await getDocumentById(id);
  if (!doc) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!canAccessDocument(access, Number(doc.user_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return new NextResponse(Buffer.from(doc.file_blob), {
    status: 200,
    headers: {
      "Content-Type": String(doc.file_type || "application/octet-stream"),
      "Content-Length": String(Buffer.byteLength(doc.file_blob)),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(String(doc.file_name || "document"))}"`,
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requirePermission("documents.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id: idRaw } = await context.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "Invalid document id." }, { status: 400 });
  const ok = await deleteDocument(id, auth.access.user_id);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ operation_status: "success", user_message: "Document deleted." });
}
