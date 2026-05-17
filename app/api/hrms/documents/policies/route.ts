import { NextResponse } from "next/server";
import { getAuthAccess, requirePermission } from "@/lib/rbac";
import {
  isDocumentCategory,
  listDocumentPolicies,
  replaceDocumentPolicies,
  type DocumentPolicyInput,
} from "@/lib/hrms/documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAuthAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (access.role !== "admin" && !access.permissions["documents.manage"]) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const policies = await listDocumentPolicies();
  return NextResponse.json({ policies });
}

export async function PUT(request: Request) {
  const auth = await requirePermission("documents.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await request.json().catch(() => null)) as { policies?: Array<Record<string, unknown>> } | null;
  if (!body || !Array.isArray(body.policies)) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }

  const normalized: DocumentPolicyInput[] = [];
  for (const item of body.policies) {
    const category = String(item.category || "");
    if (!isDocumentCategory(category)) {
      return NextResponse.json({ error: `Invalid category: ${category}` }, { status: 400 });
    }
    const expiryDays = item.expiryDays == null || String(item.expiryDays).trim() === ""
      ? null
      : Number(item.expiryDays);
    if (expiryDays != null && (!Number.isFinite(expiryDays) || expiryDays < 0)) {
      return NextResponse.json({ error: `Invalid expiry days for category: ${category}` }, { status: 400 });
    }
    normalized.push({
      category,
      department: String(item.department || "").trim() || null,
      employmentType: String(item.employmentType || "").trim() || null,
      isMandatory: Boolean(item.isMandatory),
      expiryDays,
      isActive: item.isActive !== false,
    });
  }

  await replaceDocumentPolicies(normalized, auth.access.user_id);
  return NextResponse.json({
    operation_status: "success",
    user_message: "Document policies updated.",
  });
}
