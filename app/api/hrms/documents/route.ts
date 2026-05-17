import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import { isDocumentCategory, listEmployeeDocuments, storeEmployeeDocument } from "@/lib/hrms/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canViewDocuments(access: NonNullable<Awaited<ReturnType<typeof getAuthAccess>>>) {
  if (access.role === "admin") return true;
  return Boolean(
    access.permissions["documents.view_all"] ||
      access.permissions["documents.view_team"] ||
      access.permissions["documents.view_self"],
  );
}

export async function GET(request: Request) {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canViewDocuments(access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const url = new URL(request.url);
  const employeeId = Number(url.searchParams.get("employeeId") || 0);
  const rows = await listEmployeeDocuments({
    actorUserId: access.user_id,
    role: access.role,
    employeeId: Number.isFinite(employeeId) && employeeId > 0 ? employeeId : undefined,
  });
  return NextResponse.json({ documents: rows });
}

export async function POST(request: Request) {
  const auth = await requirePermission("documents.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  const employeeId = Number(form.get("employeeId") || 0);
  const category = String(form.get("category") || "");
  const file = form.get("file");
  if (!Number.isFinite(employeeId) || employeeId <= 0) return NextResponse.json({ error: "Employee is required." }, { status: 400 });
  if (!isDocumentCategory(category)) return NextResponse.json({ error: "Invalid document category." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required." }, { status: 400 });

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  await storeEmployeeDocument({
    employeeId,
    category,
    fileName: file.name || "document",
    fileType: file.type || "application/octet-stream",
    fileSize: Number(file.size || buffer.length || 0),
    fileBuffer: buffer,
    uploadedByUserId: auth.access.user_id,
  });
  return NextResponse.json({
    operation_status: "success",
    user_message: "Document uploaded successfully.",
  });
}
