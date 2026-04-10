"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, Mail, Send, X } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

type ApplicationRow = {
  id: number;
  candidate_full_name: string;
  job_title: string;
  job_company?: string | null;
  stage: string;
};

const INTENTS: { id: string; label: string }[] = [
  { id: "next_steps", label: "Next steps / update" },
  { id: "offer_letter", label: "Offer letter (draft)" },
  { id: "rejection", label: "Rejection (polite)" },
  { id: "general", label: "General" },
];

export default function ApplicationEmailModal({
  application,
  onClose,
}: {
  application: ApplicationRow;
  onClose: () => void;
}) {
  const [intent, setIntent] = useState("next_steps");
  const [customPrompt, setCustomPrompt] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [to, setTo] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runDraft = useCallback(async () => {
    setError(null);
    setDraftBusy(true);
    try {
      const data = await apiFetchJson<{
        subject?: string;
        body?: string;
        defaultTo?: string | null;
      }>(`/api/applications/${application.id}/draft-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent,
          customPrompt: customPrompt.trim() || undefined,
        }),
      });
      if (typeof data.subject === "string") setSubject(data.subject);
      if (typeof data.body === "string") setBody(data.body);
      if (typeof data.defaultTo === "string" && data.defaultTo) {
        setTo((prev) => (prev.trim() ? prev : data.defaultTo!));
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Failed to generate draft";
      setError(msg);
    } finally {
      setDraftBusy(false);
    }
  }, [application.id, intent, customPrompt]);

  useEffect(() => {
    setSubject("");
    setBody("");
    setTo("");
    setCustomPrompt("");
    setIntent("next_steps");
    setCopied(false);
    setError(null);
    let cancelled = false;
    (async () => {
      setDraftBusy(true);
      try {
        const data = await apiFetchJson<{
          subject?: string;
          body?: string;
          defaultTo?: string | null;
        }>(`/api/applications/${application.id}/draft-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ intent: "next_steps" }),
        });
        if (cancelled) return;
        if (typeof data.subject === "string") setSubject(data.subject);
        if (typeof data.body === "string") setBody(data.body);
        if (typeof data.defaultTo === "string" && data.defaultTo) setTo(data.defaultTo);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof ApiError ? e.message : "Failed to generate draft";
          setError(msg);
        }
      } finally {
        if (!cancelled) setDraftBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [application.id]);

  async function handleSend() {
    setError(null);
    setSendBusy(true);
    try {
      await apiFetchJson(`/api/applications/${application.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body }),
      });
      onClose();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Send failed";
      setError(msg);
    } finally {
      setSendBusy(false);
    }
  }

  async function handleCopy() {
    const text = `To: ${to}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-600 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-600">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Mail className="h-5 w-5 shrink-0 text-indigo-600" aria-hidden />
              <h2 className="text-lg font-semibold">Draft &amp; send email</h2>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {application.candidate_full_name} · {application.job_title}
              {application.job_company ? ` · ${application.job_company}` : ""} · {application.stage}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={UI.label}>Intent</label>
              <select
                className={UI.select}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                disabled={draftBusy || sendBusy}
              >
                {INTENTS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={UI.label}>Extra instructions (optional)</label>
              <input
                className={UI.input}
                placeholder="e.g. Mention interview on Tuesday"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={draftBusy || sendBusy}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runDraft()}
              disabled={draftBusy || sendBusy}
              className={UI.secondaryButton + " inline-flex items-center gap-2 py-2 text-sm"}
            >
              {draftBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {draftBusy ? "Generating…" : "Regenerate draft"}
            </button>
          </div>

          <div>
            <label className={UI.label}>To (comma-separated)</label>
            <input
              className={UI.input}
              placeholder="candidate@example.com, manager@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              disabled={sendBusy}
            />
          </div>

          <div>
            <label className={UI.label}>Subject</label>
            <input className={UI.input} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={sendBusy} />
          </div>

          <div>
            <label className={UI.label}>Body</label>
            <textarea
              className={[UI.input, "min-h-[200px] resize-y font-mono text-sm"].join(" ")}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={sendBusy}
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Edit before sending. AI drafts are suggestions only—verify facts and compliance (especially offers).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-slate-600">
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={sendBusy || !subject.trim() || !body.trim()}
            className={UI.secondaryButton + " inline-flex items-center gap-2 py-2 text-sm"}
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied" : "Copy all"}
          </button>
          <button type="button" onClick={onClose} className={UI.secondaryButton + " py-2 text-sm"} disabled={sendBusy}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sendBusy || draftBusy || !to.trim() || !subject.trim() || !body.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500"
          >
            {sendBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendBusy ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}
