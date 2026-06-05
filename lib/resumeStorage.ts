import path from "path";
import { promises as fs } from "fs";

export type ResumeBlobRecord = {
  resume_url: string | null;
  resume_text?: string | null;
  resume_file_name: string | null;
  resume_file_type: string | null;
  resume_file_size: number | null;
  resume_blob: Buffer | null;
};

function contentTypeFromExt(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export function localResumePathFromUrl(resumeUrl: string | null | undefined) {
  if (!resumeUrl) return null;
  let normalized = String(resumeUrl).trim();
  if (!normalized) return null;
  try {
    if (/^https?:\/\//i.test(normalized)) {
      const u = new URL(normalized);
      normalized = `${u.pathname}${u.search || ""}`;
    }
  } catch {
    // Keep raw value.
  }
  normalized = normalized.split("?")[0];
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  if (normalized.startsWith("/api/resume/")) {
    normalized = `/uploads/resumes/${normalized.slice("/api/resume/".length).replace(/^\/+/, "")}`;
  }
  if (!normalized.startsWith("/uploads/resumes/")) return null;
  const rel = normalized.slice("/uploads/resumes/".length).replace(/^\/+/, "");
  if (!rel) return null;
  const baseDir = path.join(process.cwd(), "public", "uploads", "resumes");
  const absolutePath = path.join(baseDir, ...rel.split("/"));
  const normalizedBase = path.normalize(baseDir + path.sep);
  const normalizedTarget = path.normalize(absolutePath);
  if (!normalizedTarget.startsWith(normalizedBase)) return null;
  return normalizedTarget;
}

export async function readResumeBlobFromUrl(resumeUrl: string | null | undefined) {
  const absolutePath = localResumePathFromUrl(resumeUrl);
  if (!absolutePath) return null;
  try {
    const bytes = await fs.readFile(absolutePath);
    return {
      fileName: path.basename(absolutePath),
      fileType: contentTypeFromExt(absolutePath),
      fileSize: bytes.byteLength,
      fileBlob: bytes,
    };
  } catch {
    return null;
  }
}

export async function buildResumeBlobRecord(input: {
  resumeUrl?: string | null;
  resumeText?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileBytes?: Buffer | null;
}): Promise<ResumeBlobRecord> {
  const resume_url = input.resumeUrl ?? null;
  const resume_text = input.resumeText ?? null;

  if (input.fileBytes && input.fileBytes.byteLength > 0) {
    const safeName = input.fileName?.trim() || (resume_url ? path.basename(resume_url.split("?")[0]) : "resume");
    const safeType = input.fileType?.trim() || contentTypeFromExt(safeName);
    return {
      resume_url,
      resume_text,
      resume_file_name: safeName,
      resume_file_type: safeType,
      resume_file_size: input.fileBytes.byteLength,
      resume_blob: input.fileBytes,
    };
  }

  const recovered = await readResumeBlobFromUrl(resume_url);
  if (!recovered) {
    return {
      resume_url,
      resume_text,
      resume_file_name: null,
      resume_file_type: null,
      resume_file_size: null,
      resume_blob: null,
    };
  }

  return {
    resume_url,
    resume_text,
    resume_file_name: recovered.fileName,
    resume_file_type: recovered.fileType,
    resume_file_size: recovered.fileSize,
    resume_blob: recovered.fileBlob,
  };
}

export function contentTypeFromStoredResume(
  fileName: string | null | undefined,
  fileType: string | null | undefined,
  resumeUrl: string | null | undefined
) {
  if (fileType && fileType.trim()) return fileType.trim();
  if (fileName && fileName.trim()) return contentTypeFromExt(fileName.trim());
  if (resumeUrl && resumeUrl.trim()) return contentTypeFromExt(resumeUrl.trim());
  return "application/octet-stream";
}
