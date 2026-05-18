import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { query } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");
const MAX_FILE_SIZE = 10 * 1024 * 1024; // default 10 MB
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"];
const ALLOWED_DOC_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-rar-compressed",
];
const ALL_ALLOWED = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOC_TYPES];

export async function POST(request: Request) {
  try {
    const gate = await requirePermission("chat.view");
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const policyRes = await query(
      `SELECT max_file_size_mb FROM chat_policies ORDER BY id DESC LIMIT 1`
    ).catch(() => ({ rows: [] as Array<{ max_file_size_mb?: number }> }));
    const maxMb = Number((policyRes.rows?.[0] as { max_file_size_mb?: number } | undefined)?.max_file_size_mb ?? 10);
    const maxBytes = Math.max(1, maxMb) * 1024 * 1024;

    if (file.size > maxBytes) {
      return NextResponse.json({ error: `File too large (max ${maxMb} MB)` }, { status: 400 });
    }

    if (!ALL_ALLOWED.includes(file.type)) {
      return NextResponse.json({ error: `File type not allowed: ${file.type}` }, { status: 400 });
    }

    await mkdir(UPLOAD_DIR, { recursive: true });

    const ext = path.extname(file.name) || ".bin";
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`;
    const filePath = path.join(UPLOAD_DIR, uniqueName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const url = `/uploads/chat/${uniqueName}`;

    return NextResponse.json({
      url,
      name: file.name,
      size: file.size,
      mime: file.type,
      type: isImage ? "image" : "file",
    });
  } catch (error) {
    console.error("chat/upload POST", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
