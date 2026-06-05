import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { requireAuthUser } from "@/lib/authServer";
import { query } from "@/lib/db";
import { contentTypeFromStoredResume } from "@/lib/resumeStorage";

export const runtime = "nodejs";

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
      const storedUrl = `/uploads/resumes/${parts.join("/")}`;
      const blobRes = await query(
        `
        SELECT resume_blob, resume_file_name, resume_file_type
        FROM candidates
        WHERE resume_url = $1
          AND resume_blob IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
        `,
        [storedUrl]
      );
      const row = blobRes.rows[0] as
        | { resume_blob: Buffer | null; resume_file_name: string | null; resume_file_type: string | null }
        | undefined;
      if (!row?.resume_blob || !Buffer.isBuffer(row.resume_blob)) {
        return NextResponse.json({ error: "Resume not found" }, { status: 404 });
      }
      const fileName = row.resume_file_name?.trim() || path.basename(absolutePath);
      const body = new Uint8Array(row.resume_blob);
      return new NextResponse(body, {
        status: 200,
        headers: {
          "Content-Type": contentTypeFromStoredResume(row.resume_file_name, row.resume_file_type, storedUrl),
          "Content-Disposition": `inline; filename="${fileName}"`,
          "Cache-Control": "private, max-age=300",
        },
      });
    }

    const fileName = path.basename(absolutePath);
    const body = new Uint8Array(fileBuffer);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromStoredResume(fileName, null, absolutePath),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("Error serving resume preview", error);
    return NextResponse.json({ error: "Failed to load resume" }, { status: 500 });
  }
}

