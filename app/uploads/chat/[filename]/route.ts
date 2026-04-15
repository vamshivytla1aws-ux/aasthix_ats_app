import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { requirePermission } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "chat");

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function isSafeFilename(value: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(value);
}

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const auth = await requirePermission("chat.view");
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const filename = String(params.filename || "");
    if (!filename || !isSafeFilename(filename)) {
      return NextResponse.json({ error: "Invalid file name" }, { status: 400 });
    }

    const filePath = path.join(CHAT_UPLOAD_DIR, filename);
    const normalizedDir = path.resolve(CHAT_UPLOAD_DIR);
    const normalizedPath = path.resolve(filePath);
    if (!normalizedPath.startsWith(normalizedDir)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const fileBuffer = await readFile(normalizedPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(fileBuffer.byteLength),
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
    console.error("chat attachment GET", error);
    return NextResponse.json({ error: "Failed to load attachment" }, { status: 500 });
  }
}
