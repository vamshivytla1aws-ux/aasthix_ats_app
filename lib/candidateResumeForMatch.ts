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

export type ResolvedCandidateResumeForMatch = {
  text: string;
  source: "stored_resume_text" | "uploaded_resume_file" | "experience_summary_or_skills" | "none";
  charCount: number;
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

function localResumePathFromUrl(url: string | null | undefined): string | null {
  const raw = String(url || "").trim().replace(/\\/g, "/");
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw;
  if (raw.startsWith("uploads/")) return `/${raw}`;
  if (raw.startsWith("/public/uploads/")) return raw.replace(/^\/public/i, "");
  const apiResume = raw.match(/^\/api\/resume\/(.+)$/i);
  if (apiResume?.[1]) return `/uploads/resumes/${apiResume[1].replace(/^\/+/, "")}`;
  return null;
}

/**
 * Resolve the best available resume source for match scoring.
 * In single-candidate checks we can prefer the uploaded resume file; otherwise we
 * fall back through stored resume text and then structured profile fields.
 */
export async function resolveCandidateResumeTextForMatch(
  row: CandidateRowForMatch,
  cache: Map<string, Promise<string>> = new Map()
): Promise<string> {
  const resolved = await resolveCandidateResumeForMatchDetailed(row, cache);
  return resolved.text;
}

export async function resolveCandidateResumeForMatchDetailed(
  row: CandidateRowForMatch,
  cache: Map<string, Promise<string>> = new Map(),
  opts?: { preferUploadedFile?: boolean }
): Promise<ResolvedCandidateResumeForMatch> {
  const stored = (row.resume_text || "").trim();
  const url = localResumePathFromUrl(row.resume_url);
  const shouldTryFile = Boolean(url);

  if (opts?.preferUploadedFile && shouldTryFile) {
    const fromFile = (await readCached(url!, cache)).trim();
    if (fromFile.length >= 100) {
      return {
        text: fromFile.slice(0, MAX_CHARS),
        source: "uploaded_resume_file",
        charCount: fromFile.length,
      };
    }
  }

  if (stored.length >= 100) {
    return {
      text: stored.slice(0, MAX_CHARS),
      source: "stored_resume_text",
      charCount: stored.length,
    };
  }

  if (shouldTryFile) {
    const fromFile = (await readCached(url!, cache)).trim();
    if (fromFile.length >= 100) {
      return {
        text: fromFile.slice(0, MAX_CHARS),
        source: "uploaded_resume_file",
        charCount: fromFile.length,
      };
    }
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
    const fallback = `(No resume text on file for ${row.full_name}. Add a PDF/DOCX resume, paste an experience summary, or add skills.)`;
    return { text: fallback, source: "none", charCount: fallback.length };
  }
  const joined = parts.join("\n\n");
  return {
    text: joined.slice(0, MAX_CHARS),
    source: "experience_summary_or_skills",
    charCount: joined.length,
  };
}
