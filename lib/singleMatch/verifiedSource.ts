import { createHash } from "crypto";
import path from "path";
import { promises as fs } from "fs";
import mammoth from "mammoth";
import { query } from "@/lib/db";

export const MATCH_PARSER_VERSION = "full-document-v1";
export const contentHash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export type VerifiedSource = { text: string; fileHash: string; parserVersion: string; pages: number; error?: string };
const cache = new Map<string, { source: VerifiedSource; expires: number }>();

/** No directory guessing, summary fallback or OCR output of unknown completeness. */
export async function loadVerifiedMatchResume(candidateId: number): Promise<VerifiedSource> {
  const unavailable = (error: string): VerifiedSource => ({ text: "", fileHash: "", parserVersion: MATCH_PARSER_VERSION, pages: 0, error });
  const { rows } = await query("SELECT resume_blob, resume_file_name, resume_url FROM candidates WHERE id = $1", [candidateId]);
  const row = rows[0];
  if (!row) return unavailable("Current resume not found. Upload a complete PDF or DOCX.");
  let buffer: Buffer;
  let filename = String(row.resume_file_name || "");
  try {
    if (row.resume_blob) buffer = Buffer.from(row.resume_blob);
    else {
      const url = String(row.resume_url || "");
      if (!url.startsWith("/uploads/")) return unavailable("The current resume file is unavailable. Please upload it again.");
      const root = path.resolve(process.cwd(), "public", "uploads");
      const target = path.resolve(process.cwd(), "public", url.slice(1));
      if (!target.startsWith(root + path.sep)) return unavailable("Invalid resume file location.");
      const real = await fs.realpath(target);
      if (!real.startsWith(root + path.sep)) return unavailable("Invalid resume file location.");
      buffer = await fs.readFile(real);
      filename = filename || path.basename(target);
    }
    if (!buffer.length || buffer.length > 15 * 1024 * 1024) return unavailable("Resume is empty or exceeds the 15 MB evaluation limit.");
    const fileHash = contentHash(buffer);
    const key = `${candidateId}:${fileHash}:${MATCH_PARSER_VERSION}`;
    const existing = cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.source;
    let text = "";
    let pages = 1;
    if (/\.pdf$/i.test(filename)) {
      const { PDFExtract } = await import("pdf.js-extract");
      const data = await new PDFExtract().extractBuffer(buffer, {});
      pages = data.pages.length;
      const pageTexts = data.pages.map(page => page.content.map(item => item.str).join(" ").trim());
      if (!pages || pageTexts.some(page => page.replace(/\s/g, "").length < 30)) {
        return { ...unavailable("At least one PDF page has insufficient readable text. Upload a searchable, complete resume."), fileHash, pages };
      }
      text = pageTexts.join("\n\n");
    } else if (/\.docx$/i.test(filename)) {
      const parsed = await mammoth.extractRawText({ buffer });
      if (parsed.messages.some(message => message.type === "error")) return unavailable("Resume extraction failed.");
      text = parsed.value;
    } else return unavailable("Upload a searchable PDF or DOCX for verified full-document evaluation.");
    text = text.trim();
    if (text.length < 250 || (text.match(/\p{L}/gu)?.length || 0) / text.length < 0.25) {
      return { ...unavailable("Too little usable resume text was extracted. Upload a complete searchable resume."), fileHash, pages };
    }
    const source = { text, fileHash, parserVersion: MATCH_PARSER_VERSION, pages };
    if (cache.size >= 20) cache.delete(cache.keys().next().value!);
    cache.set(key, { source, expires: Date.now() + 15 * 60_000 });
    return source;
  } catch {
    return unavailable("The current resume could not be read completely. Please replace it with a searchable PDF or DOCX.");
  }
}
