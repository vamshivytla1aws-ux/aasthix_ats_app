import { extractPlainTextFromResumeBuffer } from "@/lib/resumeParser";

export type AiInterviewResumeContext = {
  text: string;
  source: "UPLOADED_RESUME" | "STORED_RESUME_TEXT" | "NONE";
  sourceQuality: "FULL" | "PARTIAL" | "LIMITED";
};

export async function resolveAiInterviewResumeContext(row: {
  resume_blob?: Buffer | Uint8Array | null;
  resume_file_name?: string | null;
  resume_text?: string | null;
}): Promise<AiInterviewResumeContext> {
  if (row.resume_blob) {
    try {
      const buffer = Buffer.isBuffer(row.resume_blob)
        ? row.resume_blob
        : Buffer.from(row.resume_blob);
      const parsed = (
        await extractPlainTextFromResumeBuffer(
          row.resume_file_name || "resume.pdf",
          buffer,
        )
      ).trim();
      if (parsed.length >= 100)
        return {
          text: parsed,
          source: "UPLOADED_RESUME",
          sourceQuality: parsed.length >= 1000 ? "FULL" : "PARTIAL",
        };
    } catch (error) {
      console.error("[ai-interviews] uploaded resume parse failed", error);
    }
  }
  const stored = String(row.resume_text || "").trim();
  if (stored.length >= 100)
    return {
      text: stored,
      source: "STORED_RESUME_TEXT",
      sourceQuality: stored.length >= 1000 ? "FULL" : "PARTIAL",
    };
  return { text: stored, source: "NONE", sourceQuality: "LIMITED" };
}
