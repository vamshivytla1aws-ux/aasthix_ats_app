"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, Instagram, Linkedin, Share2, X as CloseIcon } from "lucide-react";

type JobForShare = {
  id: number;
  title: string;
  location?: string | null;
  employment_type?: string | null;
  experience_requirement?: string | null;
  status?: string | null;
  open_positions?: number | null;
};

type ShareResponse = {
  configured: boolean;
  public_path: string;
  public_url: string;
  job: JobForShare;
};

function clean(value: string | null | undefined) {
  return String(value || "").trim();
}

function buildCaption(job: JobForShare, shareUrl: string) {
  const details = [clean(job.location), clean(job.employment_type), clean(job.experience_requirement)].filter(Boolean);
  const lines = [`We're hiring: ${job.title}`];
  if (details.length > 0) lines.push(details.join(" | "));
  lines.push("Apply here:");
  lines.push(shareUrl);
  return lines.join("\n");
}

function buildShortCaption(job: JobForShare, shareUrl: string) {
  const detail = clean(job.location) || clean(job.experience_requirement) || clean(job.employment_type);
  return [`We're hiring for ${job.title}.`, detail, shareUrl].filter(Boolean).join(" ");
}

export default function SocialShareModal({
  open,
  job,
  onClose,
  onToast,
}: {
  open: boolean;
  job: JobForShare;
  onClose: () => void;
  onToast: (message: string, variant?: "success" | "error") => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ShareResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPayload(null);

    const track = async (eventType: string) => {
      try {
        await fetch("/api/careers/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: eventType,
            job_id: job.id,
            session_id: `ats-share-${job.id}`,
            meta: { source: "ats_job_detail" },
          }),
        });
      } catch {
        // ignore tracking failures
      }
    };

    void track("share_modal_open");
    void (async () => {
      try {
        const res = await fetch(`/api/careers/job/${job.id}`, { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as Partial<ShareResponse> & { error?: string };
        if (cancelled) return;
        if (!res.ok || !data.public_url || !data.public_path || !data.job) {
          setError(typeof data.error === "string" ? data.error : "This job is not available for public sharing.");
          setLoading(false);
          return;
        }
        setPayload(data as ShareResponse);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("We couldn't prepare the public share link right now.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [job.id, open]);

  const shareUrl = payload?.public_url || "";
  const longCaption = useMemo(() => buildCaption(job, shareUrl), [job, shareUrl]);
  const shortCaption = useMemo(() => buildShortCaption(job, shareUrl), [job, shareUrl]);
  const linkedinUrl = useMemo(
    () => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    [shareUrl]
  );
  const xUrl = useMemo(
    () => `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shortCaption)}`,
    [shareUrl, shortCaption]
  );

  async function track(eventType: string) {
    try {
      await fetch("/api/careers/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: eventType,
          job_id: job.id,
          session_id: `ats-share-${job.id}`,
          meta: { source: "ats_job_detail" },
        }),
      });
    } catch {
      // ignore
    }
  }

  async function copyText(text: string, successMessage: string, eventType: string) {
    try {
      await navigator.clipboard.writeText(text);
      onToast(successMessage, "success");
      void track(eventType);
    } catch {
      onToast("Clipboard copy failed. Please copy it manually.", "error");
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5 dark:border-slate-800">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Share2 className="h-3.5 w-3.5" />
              Social sharing
            </div>
            <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">Post in social media</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Share a stable public JD link without exposing the company name on the public page.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-900"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Preview</div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{job.title}</h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                {[clean(job.location), clean(job.employment_type), clean(job.experience_requirement)].filter(Boolean).join(" • ") || "Public single-job careers page"}
              </p>
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300">
                {loading ? "Preparing share link..." : shareUrl || "Public link unavailable"}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Suggested post</div>
              <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">{longCaption}</pre>
            </div>
          </div>

          <div className="space-y-3">
            {error ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              disabled={!shareUrl || loading}
              onClick={() => void copyText(shareUrl, "Public share link copied.", "copy_public_link")}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <span>Copy link</span>
              <Copy className="h-4 w-4" />
            </button>

            <Link
              href={shareUrl || "#"}
              target="_blank"
              rel="noreferrer"
              onClick={() => { if (shareUrl) void track("open_public_page"); }}
              className={`flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium transition dark:border-slate-800 ${
                shareUrl ? "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900" : "pointer-events-none opacity-60"
              }`}
            >
              <span>Open public page</span>
              <ExternalLink className="h-4 w-4" />
            </Link>

            <Link
              href={shareUrl ? linkedinUrl : "#"}
              target="_blank"
              rel="noreferrer"
              onClick={() => { if (shareUrl) void track("share_linkedin_click"); }}
              className={`flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium transition dark:border-slate-800 ${
                shareUrl ? "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900" : "pointer-events-none opacity-60"
              }`}
            >
              <span>Share to LinkedIn</span>
              <Linkedin className="h-4 w-4" />
            </Link>

            <Link
              href={shareUrl ? xUrl : "#"}
              target="_blank"
              rel="noreferrer"
              onClick={() => { if (shareUrl) void track("share_x_click"); }}
              className={`flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium transition dark:border-slate-800 ${
                shareUrl ? "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900" : "pointer-events-none opacity-60"
              }`}
            >
              <span>Share to X</span>
              <span className="text-sm font-semibold">X</span>
            </Link>

            <button
              type="button"
              disabled={!shareUrl || loading}
              onClick={() => void copyText(longCaption, "Instagram caption copied.", "copy_instagram_caption")}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <span>Copy Instagram caption</span>
              <Instagram className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={!shareUrl || loading}
              onClick={() => void copyText(shortCaption, "Short social caption copied.", "copy_short_caption")}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900"
            >
              <span>Copy short social caption</span>
              <Copy className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={!shareUrl || loading}
              onClick={() => void copyText(longCaption, "Ready-to-post text copied.", "copy_ready_post_text")}
              className="flex w-full items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-left text-sm font-medium text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200 dark:hover:bg-indigo-950/50"
            >
              <span>Copy ready-to-post text</span>
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
