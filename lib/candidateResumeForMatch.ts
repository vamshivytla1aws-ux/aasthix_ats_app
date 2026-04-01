import path from "path";
import { promises as fs } from "fs";
import { extractPlainTextFromResumeBuffer } from "@/lib/resumeParser";

export type CandidateRowForMatch = {
  id: number;
  full_name: string;
  skills: string | null;
  location: string | null;
  resume_url?: string | null;
  resume_text?: string | null;
  experience_summary?: string | null;
  skillset?: string[] | null;
};

const MAX_CHARS = 14_000;

async function readCached(
  url: string,
  cache: Map<string, Promise<string>>
): Promise<string> {
  const existing = cache.get(url);
  if (existing) return existing;
  const p = (async () => {
    try {
      const abs = path.join(process.cwd(), "public", url.replace(/^\//, ""));
      const buf = await fs.readFile(abs);
      const base = path.basename(abs);
      const ext = path.extname(base).toLowerCase();
      if (ext !== ".pdf" && ext !== ".docx") return "";
      return await extractPlainTextFromResumeBuffer(base, buf);
    } catch {
      return "";
    }
  })();
  cache.set(url, p);
  return p;
}

/**
 * Prefer stored resume_text; else parse local uploaded file; else structured profile fields.
 * Used by job match rescoring so the model sees real resume content, not skill tags alone.
 */
export async function resolveCandidateResumeTextForMatch(
  row: CandidateRowForMatch,
  cache: Map<string, Promise<string>> = new Map()
): Promise<string> {
  const stored = (row.resume_text || "").trim();
  if (stored.length >= 100) return stored.slice(0, MAX_CHARS);

  const url = row.resume_url?.trim();
  if (url && url.startsWith("/uploads/")) {
    const fromFile = (await readCached(url, cache)).trim();
    if (fromFile.length >= 100) return fromFile.slice(0, MAX_CHARS);
  }

  const parts: string[] = [];
  if (row.experience_summary?.trim()) {
    parts.push(`EXPERIENCE SUMMARY:\n${row.experience_summary.trim()}`);
  }
  if (Array.isArray(row.skillset) && row.skillset.length) {
    parts.push(`TAGGED SKILLS:\n${row.skillset.join(", ")}`);
  }
  if (row.skills?.trim()) {
    parts.push(`SKILLS / PROFILE:\n${row.skills.trim()}`);
  }
  if (parts.length === 0) {
    return `(No resume text on file for ${row.full_name}. Add a PDF/DOCX resume, paste an experience summary, or add skills.)`;
  }
  return parts.join("\n\n").slice(0, MAX_CHARS);
}
