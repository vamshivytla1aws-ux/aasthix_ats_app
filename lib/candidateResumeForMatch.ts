import path from "path";
import { promises as fs } from "fs";
import type { Dirent } from "node:fs";
import { extractPlainTextFromResumeBuffer } from "@/lib/resumeParser";

export type CandidateRowForMatch = {
  id: number;
  full_name: string;
  email?: string | null;
  skills: string | null;
  location: string | null;
  created_by_user_id?: number | null;
  resume_url?: string | null;
  resume_text?: string | null;
  experience_summary?: string | null;
  skillset?: string[] | null;
};

export type ResumeSourceKind = "stored_resume_text" | "uploaded_resume_file" | "experience_summary_or_skills" | "none";

export type ResumeRecoveryMetadata = {
  attempted: boolean;
  succeeded: boolean;
  reason: string | null;
  sourceBefore: ResumeSourceKind | null;
  sourceAfter: ResumeSourceKind | null;
  recoveredResumeUrl: string | null;
};

export type ResolvedCandidateResumeForMatch = {
  text: string;
  source: ResumeSourceKind;
  charCount: number;
  resolvedResumeUrl?: string | null;
  recovery?: ResumeRecoveryMetadata;
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
  let raw = String(url || "").trim().replace(/\\/g, "/");
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      raw = `${parsed.pathname || ""}${parsed.search || ""}`;
    } catch {
      return null;
    }
  }

  raw = raw.split("?")[0]?.split("#")[0] || "";
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw;
  if (raw.startsWith("uploads/")) return `/${raw}`;
  if (raw.startsWith("/public/uploads/")) return raw.replace(/^\/public/i, "");
  const apiResume = raw.match(/^\/api\/resume\/(.+)$/i);
  if (apiResume?.[1]) return `/uploads/resumes/${apiResume[1].replace(/^\/+/, "")}`;
  return null;
}

function inferSourceBeforeRecovery(row: CandidateRowForMatch): ResumeSourceKind {
  const stored = (row.resume_text || "").trim();
  const parts: string[] = [];
  if (row.experience_summary?.trim()) parts.push(row.experience_summary.trim());
  if (Array.isArray(row.skillset) && row.skillset.length) parts.push(row.skillset.join(", "));
  if (row.skills?.trim()) parts.push(row.skills.trim());
  if (stored.length >= 100) return "stored_resume_text";
  if (localResumePathFromUrl(row.resume_url)) return "uploaded_resume_file";
  if (parts.length > 0) return "experience_summary_or_skills";
  return "none";
}

function fileUrlFromAbsolutePath(absolutePath: string): string | null {
  const uploadsBase = path.join(process.cwd(), "public", "uploads", "resumes");
  const normalizedBase = path.normalize(uploadsBase + path.sep);
  const normalizedTarget = path.normalize(absolutePath);
  if (!normalizedTarget.startsWith(normalizedBase)) return null;
  const rel = path.relative(uploadsBase, absolutePath).replace(/\\/g, "/");
  return rel ? `/uploads/resumes/${rel}` : null;
}

async function collectResumeFilesRecursive(dir: string, maxFiles: number, out: string[] = []): Promise<string[]> {
  if (out.length >= maxFiles) return out;
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (out.length >= maxFiles) break;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectResumeFilesRecursive(fullPath, maxFiles, out);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".pdf" || ext === ".docx") out.push(fullPath);
  }
  return out;
}

function countSharedNameTokens(candidateName: string, text: string): number {
  const tokens = candidateName
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return 0;
  return tokens.filter((token) => text.includes(token)).length;
}

function resumeLooksLikeCandidate(row: CandidateRowForMatch, text: string): boolean {
  const lower = text.toLowerCase();
  const email = String(row.email || "").trim().toLowerCase();
  if (email && lower.includes(email)) return true;

  const sharedNameTokens = countSharedNameTokens(row.full_name || "", lower);
  if (sharedNameTokens >= 2) return true;

  const location = String(row.location || "").trim().toLowerCase();
  const matchedSkills = (row.skills || "")
    .split(/[,;\n]/)
    .map((skill) => skill.trim().toLowerCase())
    .filter((skill) => skill.length >= 3 && lower.includes(skill))
    .length;

  if (sharedNameTokens >= 1 && (location ? lower.includes(location) : matchedSkills >= 2)) return true;
  return false;
}

async function recoverResumeFromFilesystem(
  row: CandidateRowForMatch,
  cache: Map<string, Promise<string>>
): Promise<{ resumeUrl: string; text: string } | null> {
  const uploadsBase = path.join(process.cwd(), "public", "uploads", "resumes");
  const candidateDirs = [
    row.created_by_user_id ? path.join(uploadsBase, "careers", String(row.created_by_user_id)) : null,
    uploadsBase,
  ].filter((value): value is string => Boolean(value));

  const visited = new Set<string>();
  const fileCandidates: string[] = [];
  for (const dir of candidateDirs) {
    if (visited.has(dir)) continue;
    visited.add(dir);
    const files = await collectResumeFilesRecursive(dir, 250);
    fileCandidates.push(...files);
  }

  for (const absolutePath of fileCandidates) {
    const resumeUrl = fileUrlFromAbsolutePath(absolutePath);
    if (!resumeUrl) continue;
    const text = (await readCached(resumeUrl, cache)).trim();
    if (text.length < 100) continue;
    if (resumeLooksLikeCandidate(row, text)) {
      return { resumeUrl, text };
    }
  }

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
  const sourceBefore = inferSourceBeforeRecovery(row);
  const shouldAttemptRecovery = Boolean(opts?.preferUploadedFile);
  let recovery: ResumeRecoveryMetadata = {
    attempted: false,
    succeeded: false,
    reason: null,
    sourceBefore,
    sourceAfter: sourceBefore,
    recoveredResumeUrl: null,
  };

  if (opts?.preferUploadedFile && shouldTryFile) {
    const fromFile = (await readCached(url!, cache)).trim();
    if (fromFile.length >= 100) {
      return {
        text: fromFile.slice(0, MAX_CHARS),
        source: "uploaded_resume_file",
        charCount: fromFile.length,
        resolvedResumeUrl: url,
        recovery,
      };
    }
    recovery = {
      ...recovery,
      attempted: true,
      reason: "Existing resume link could not be parsed into usable full-text content.",
    };
  } else if (shouldAttemptRecovery) {
    recovery = {
      ...recovery,
      attempted: true,
      reason: "Candidate record did not have a usable uploaded resume link.",
    };
  }

  if (shouldAttemptRecovery) {
    const recovered = await recoverResumeFromFilesystem(row, cache);
    if (recovered) {
      return {
        text: recovered.text.slice(0, MAX_CHARS),
        source: "uploaded_resume_file",
        charCount: recovered.text.length,
        resolvedResumeUrl: recovered.resumeUrl,
        recovery: {
          ...recovery,
          attempted: true,
          succeeded: true,
          reason: "Recovered uploaded resume file from local resume storage.",
          sourceAfter: "uploaded_resume_file",
          recoveredResumeUrl: recovered.resumeUrl,
        },
      };
    }
    if (recovery.attempted) {
      recovery = {
        ...recovery,
        reason: recovery.reason || "No recoverable uploaded resume file was found for this candidate.",
      };
    }
  }

  if (stored.length >= 100) {
    return {
      text: stored.slice(0, MAX_CHARS),
      source: "stored_resume_text",
      charCount: stored.length,
      resolvedResumeUrl: url,
      recovery: {
        ...recovery,
        sourceAfter: "stored_resume_text",
      },
    };
  }

  if (shouldTryFile) {
    const fromFile = (await readCached(url!, cache)).trim();
    if (fromFile.length >= 100) {
      return {
        text: fromFile.slice(0, MAX_CHARS),
        source: "uploaded_resume_file",
        charCount: fromFile.length,
        resolvedResumeUrl: url,
        recovery: {
          ...recovery,
          sourceAfter: "uploaded_resume_file",
        },
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
    return {
      text: fallback,
      source: "none",
      charCount: fallback.length,
      resolvedResumeUrl: url,
      recovery: {
        ...recovery,
        sourceAfter: "none",
      },
    };
  }
  const joined = parts.join("\n\n");
  return {
    text: joined.slice(0, MAX_CHARS),
    source: "experience_summary_or_skills",
    charCount: joined.length,
    resolvedResumeUrl: url,
    recovery: {
      ...recovery,
      sourceAfter: "experience_summary_or_skills",
    },
  };
}
