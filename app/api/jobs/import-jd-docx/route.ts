import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/rbac";
import { extractTextFromDocxBuffer } from "@/lib/jdDocxImport";

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 500_000;

export async function POST(request: Request) {
  const auth = await requirePermission("jobs.manage");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    const lowerName = (file.name || "").toLowerCase();
    if (!lowerName.endsWith(".docx")) {
      return NextResponse.json({ error: "Please upload a .docx file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File is too large. Please upload files under 12MB." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    let text = await extractTextFromDocxBuffer(bytes);
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS);
    }
    if (!text.trim()) {
      return NextResponse.json(
        { error: "No text could be extracted from this document. Try saving the file as .docx again or paste the text." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (error: unknown) {
    console.error("import-jd-docx", error);
    const message = error instanceof Error ? error.message : "Failed to read document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
