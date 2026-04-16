/**
 * Convert stored `resume_url` to a browser-usable href.
 * Paths under `/uploads/resumes/` are served via `/api/resume/...` (auth + filesystem).
 * External URLs are returned unchanged.
 */
export function normalizeResumeLink(url: string | null | undefined): string | null {
  if (url == null) return null;
  let u = String(url).trim();
  if (!u) return null;
  u = u.replace(/\\/g, "/");
  if (/^\/?public\//i.test(u)) u = u.replace(/^\/?public\//i, "/");
  if (!u.startsWith("/") && u.startsWith("uploads/resumes/")) u = `/${u}`;
  if (u.startsWith("/uploads/resumes/")) {
    const rel = u.slice("/uploads/resumes/".length).replace(/^\/+/, "");
    if (!rel) return null;
    return `/api/resume/${rel}`;
  }
  return u;
}
