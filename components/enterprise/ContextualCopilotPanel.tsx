"use client";

import React, { useCallback, useState } from "react";
import { ChevronDown, ChevronUp, Send, Sparkles } from "lucide-react";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

export type CopilotScope = "job" | "candidate" | "application";

type Msg = { role: "user" | "assistant"; content: string };

const PRESETS: Record<CopilotScope, { label: string; message: string }[]> = {
  job: [
    {
      label: "JD bias & inclusion review",
      message:
        "Review the job description in context. Flag potentially biased or exclusionary phrases and suggest inclusive, skills-focused alternatives.",
    },
    {
      label: "Draft candidate outreach",
      message:
        "Draft a concise, professional outreach email to a prospective candidate for this role. Use the job title and company from context.",
    },
    {
      label: "Summarize for hiring manager",
      message:
        "Summarize this role in 5–7 bullets for a hiring manager: scope, must-have skills, and how success is measured.",
    },
  ],
  candidate: [
    {
      label: "Profile summary (bullets)",
      message: "Summarize this candidate profile in 5 bullets for a hiring manager: strengths, gaps, and suggested follow-ups.",
    },
    {
      label: "Polite rejection draft",
      message:
        "Draft a short, respectful rejection email. Use the candidate's name from context if available. Do not promise future opportunities unless generic.",
    },
    {
      label: "Screening question ideas",
      message: "Suggest 5 structured screening questions tailored to this candidate's background and skills in context.",
    },
  ],
  application: [
    {
      label: "Status & ownership summary",
      message:
        "Summarize pipeline stage, record status, assigned recruiter, and who created the application—only using the context provided.",
    },
    {
      label: "Next-steps email to candidate",
      message:
        "Draft an email to the candidate explaining next steps based on their current stage. Keep tone professional and clear.",
    },
    {
      label: "Role fit assessment",
      message:
        "Based only on the job description and candidate profile in context, assess fit: strengths, gaps, and one recommendation for the recruiter.",
    },
  ],
};

export default function ContextualCopilotPanel({
  scope,
  entityId,
  subtitle,
}: {
  scope: CopilotScope;
  entityId: number;
  subtitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setError(null);
      setBusy(true);
      const userMsg: Msg = { role: "user", content: trimmed };
      setMessages((prev) => {
        const next = [...prev, userMsg];
        return next;
      });
      setInput("");
      try {
        const data = await apiFetchJson<{ reply?: string }>("/api/contextual-ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope,
            entityId,
            message: trimmed,
            history: messages.map((h) => ({ role: h.role, content: h.content })),
          }),
        });
        const reply = typeof data?.reply === "string" ? data.reply : "";
        setMessages((prev) => [...prev, { role: "assistant", content: reply || "(empty response)" }]);
      } catch (e) {
        const msg = e instanceof ApiError ? e.message : "Request failed";
        setError(msg);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        setBusy(false);
      }
    },
    [busy, entityId, messages, scope]
  );

  return (
    <div className={`${UI.enterprise.elevatedCard} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">Contextual copilot</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Enterprise model · {subtitle || `${scope} #${entityId}`}
            </span>
          </span>
        </span>
        {open ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-600">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS[scope].map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={busy}
                onClick={() => void send(p.message)}
                className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-2 py-1 text-[11px] font-medium text-indigo-900 hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
              >
                {p.label}
              </button>
            ))}
          </div>

          {error ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          ) : null}

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900/40">
            {messages.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ask about this record or use a quick action. Context is loaded server-side; answers apply only to what you can access.
              </p>
            ) : (
              messages.map((m, i) => (
                <div
                  key={i}
                  className={
                    m.role === "user"
                      ? "ml-4 rounded-lg bg-white px-3 py-2 text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                      : "mr-4 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  }
                >
                  <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {m.role === "user" ? "You" : "Copilot"}
                  </div>
                  <div className="whitespace-pre-wrap text-xs leading-relaxed">{m.content}</div>
                </div>
              ))
            )}
            {busy ? <div className="text-xs text-slate-500">Thinking…</div> : null}
          </div>

          <div className="flex gap-2">
            <textarea
              className={[UI.input, "min-h-[72px] flex-1 resize-y text-sm"].join(" ")}
              placeholder="Ask anything about this job, candidate, or application…"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
            />
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={() => void send(input)}
              className="self-end rounded-xl bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500"
              title="Send"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
