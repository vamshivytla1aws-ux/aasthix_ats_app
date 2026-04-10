import mammoth from "mammoth";

function normalizeWhitespace(s: string) {
  return s.replace(/\r/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Plain text from a .docx buffer (job description import). */
export async function extractTextFromDocxBuffer(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  const raw = result.value ?? "";
  return normalizeWhitespace(raw);
}
