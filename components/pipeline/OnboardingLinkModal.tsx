"use client";

import React, { useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

type AppRow = {
  id: number;
  candidate_full_name: string;
  job_title: string;
  stage: string;
};

export default function OnboardingLinkModal({
  application,
  onClose,
  onSent,
}: {
  application: AppRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [deadlineAt, setDeadlineAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    apiFetchJson<{ application: { candidate_email?: string | null } }>(`/api/applications/${application.id}/onboarding`)
      .then((data) => {
        if (!stop) setTo(String(data?.application?.candidate_email || ""));
      })
      .catch(() => void 0);
    return () => {
      stop = true;
    };
  }, [application.id]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ onboarding?: { public_url?: string } }>(
        `/api/applications/${application.id}/onboarding/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, note, deadline_at: deadlineAt || null }),
        }
      );
      setSentUrl(data?.onboarding?.public_url || null);
      onSent();
    } catch (e: any) {
      setError(e?.message || "Failed to send onboarding link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-slate-900">Send onboarding link</div>
        <div className="mt-1 text-sm text-slate-600">
          {application.candidate_full_name} · {application.job_title}
        </div>
        {error ? <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
        {sentUrl ? (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            <div className="font-medium">Onboarding link sent successfully.</div>
            <div className="mt-2 break-all text-xs text-emerald-800">{sentUrl}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                onClick={() => window.open(sentUrl, "_blank", "noopener,noreferrer")}
              >
                Open preview
              </button>
              <button
                type="button"
                className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sentUrl);
                  } catch {
                    /* noop */
                  }
                }}
              >
                Copy link
              </button>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-3">
          <div>
            <label className={UI.label}>Candidate email</label>
            <input className={UI.input} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className={UI.label}>Deadline (optional)</label>
            <input
              type="datetime-local"
              className={UI.input}
              value={deadlineAt}
              onChange={(e) => setDeadlineAt(e.target.value)}
            />
          </div>
          <div>
            <label className={UI.label}>Note (optional)</label>
            <textarea className={[UI.input, "min-h-[90px]"].join(" ")} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={UI.secondaryButton + " py-2 text-sm"} onClick={onClose} disabled={busy}>
            Close
          </button>
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            onClick={() => void send()}
            disabled={busy || !to.trim()}
          >
            {busy ? "Sending..." : "Send onboarding link"}
          </button>
        </div>
      </div>
    </div>
  );
}
