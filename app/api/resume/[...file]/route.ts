import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuthUser } from "@/lib/authServer";

export const runtime = "nodejs";

function contentTypeFromExt(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: { file: string[] } }
) {
  try {
    const user = await requireAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parts = params.file || [];
    if (parts.length === 0) {
      return NextResponse.json({ error: "File path is required" }, { status: 400 });
    }

    // Prevent path traversal.
    if (parts.some((p) => p.includes("..") || p.includes("/") || p.includes("\\"))) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    const baseDir = path.join(process.cwd(), "public", "uploads", "resumes");
    const absolutePath = path.join(baseDir, ...parts);

    const normalizedBase = path.normalize(baseDir + path.sep);
    const normalizedTarget = path.normalize(absolutePath);
    if (!normalizedTarget.startsWith(normalizedBase)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absolutePath);
    } catch {
      return NextResponse.json({ error: "Resume not found" }, { status: 404 });
    }

    const fileName = path.basename(absolutePath);
    const body = new Uint8Array(fileBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromExt(absolutePath),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error serving resume preview", error);
    return NextResponse.json({ error: "Failed to load resume" }, { status: 500 });
  }
}

