"use client";

import { useMemo, useState } from "react";
import { useEffect } from "react";
import { normalizeResumeLink } from "@/lib/resumeLink";

export default function ResumePreview({ resumeUrl }: { resumeUrl: string | null }) {
  const [loading, setLoading] = useState(true);
  const [previewFailed, setPreviewFailed] = useState(false);

  const previewUrl = useMemo(() => normalizeResumeLink(resumeUrl), [resumeUrl]);
  const downloadHref = useMemo(() => normalizeResumeLink(resumeUrl) || resumeUrl || null, [resumeUrl]);

  useEffect(() => {
    // Reset state whenever resume changes.
    setLoading(!!resumeUrl);
    setPreviewFailed(false);
  }, [resumeUrl]);

  useEffect(() => {
    if (!resumeUrl || !loading) return;
    // Guard against stuck iframe loads.
    const t = window.setTimeout(() => {
      setLoading(false);
      setPreviewFailed(true);
    }, 12000);
    return () => window.clearTimeout(t);
  }, [resumeUrl, loading]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-slate-900">Resume</div>

      {resumeUrl && previewUrl ? (
        <div className="space-y-3">
          {loading && !previewFailed && (
            <div className="h-[500px] w-full rounded-lg border bg-slate-50 p-4 animate-pulse text-sm text-slate-500">
              Loading resume preview...
            </div>
          )}
          {!previewFailed ? (
            <iframe
              src={previewUrl}
              className={["w-full h-[500px] rounded-lg border", loading ? "hidden" : "block"].join(" ")}
              title="Candidate Resume"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false);
                setPreviewFailed(true);
              }}
            />
          ) : (
            <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-slate-600">
              Preview not available for this file. Please download the resume.
            </div>
          )}
          <a
            href={downloadHref || undefined}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-all duration-200"
          >
            Download Resume
          </a>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-slate-50 p-8 text-center text-sm text-slate-500">
          No Resume Uploaded
        </div>
      )}
    </div>
  );
}

