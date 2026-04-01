import { NextResponse } from "next/server";
import { requireAuthUser } from "@/lib/authServer";
import { parseResumeBuffer } from "@/lib/resumeParser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const allowedMime = new Set([
      "application/pdf",
      "application/x-pdf",
      "application/octet-stream",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);
    const lowerName = (file.name || "").toLowerCase();
    const extOk = lowerName.endsWith(".pdf") || lowerName.endsWith(".docx");
    if (!extOk) {
      return NextResponse.json({ error: "Unsupported file. Please upload PDF or DOCX only." }, { status: 400 });
    }
    // MIME can be inconsistent across browsers; extension is primary, MIME is secondary.
    if (file.type && !allowedMime.has(file.type)) {
      const maybePdf = lowerName.endsWith(".pdf");
      const maybeDocx = lowerName.endsWith(".docx");
      if (!maybePdf && !maybeDocx) {
        return NextResponse.json({ error: "Unsupported file type for resume parsing." }, { status: 400 });
      }
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "File is too large. Please upload files under 12MB." }, { status: 400 });
    }

    const filename = file.name || "resume";
    const bytes = Buffer.from(await file.arrayBuffer());
    const parsed = await parseResumeBuffer(filename, bytes);
    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error("Error parsing resume", error);
    return NextResponse.json(
      { error: error?.message || "Failed to parse resume" },
      { status: 500 }
    );
  }
}

