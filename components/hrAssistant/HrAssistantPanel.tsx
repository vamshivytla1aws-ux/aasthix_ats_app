"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, Download, Link2, Loader2, Mic, MicOff, Send, Sparkles, Trash2, User } from "lucide-react";
import type {
  HrAssistantPlan,
  HrChartPoint,
  HrDirectAction,
  HrEntity,
  HrQueryResult,
  HrQuickAction,
  HrRelatedLink,
  HrVerificationMeta,
} from "@/lib/hrAssistant/types";

type ChatReply = {
  text: string;
  plan?: HrAssistantPlan;
  result?: HrQueryResult;
  quickActions?: HrQuickAction[];
  error?: string;
  insights?: string | null;
  suggestedFollowUps?: string[];
  relatedLinks?: HrRelatedLink[];
  chartSeries?: HrChartPoint[] | null;
  verification?: HrVerificationMeta;
};

type StoredMessage = {
  id: number;
  role: string;
  content: {
    text?: string;
    plan?: HrAssistantPlan;
    display?: { columns: string[]; rows: Record<string, unknown>[]; entity: string | null };
    quickActions?: HrQuickAction[];
    error?: string;
    action?: HrDirectAction;
    insights?: string | null;
    suggestedFollowUps?: string[];
    relatedLinks?: HrRelatedLink[];
    chartSeries?: HrChartPoint[] | null;
    verification?: HrVerificationMeta;
  };
  created_at: string;
};

function renderInlineBold(text: string) {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-slate-900 dark:text-slate-50">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function downloadCsv(columns: string[], rows: Record<string, unknown>[], filename: string) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [columns.map(esc).join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatCell(key: string, value: unknown, entity: HrEntity | null) {
  if (value === null || value === undefined || value === "") return "—";
  if (key === "candidate_id" && typeof value === "number") {
    return (
      <Link href={`/candidates/${value}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        {value}
      </Link>
    );
  }
  if (key === "job_id" && typeof value === "number") {
    return (
      <Link href={`/jobs/${value}`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        {value}
      </Link>
    );
  }
  if (key === "application_id" && typeof value === "number") {
    return (
      <Link href={`/pipeline`} className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
        {value}
      </Link>
    );
  }
  if (typeof value === "object") return JSON.stringify(value);
  const s = String(value);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function ResultTable({ result }: { result: HrQueryResult }) {
  if (!result.columns.length || !result.rows.length) return null;
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className="min-w-full divide-y divide-slate-200 text-left text-xs dark:divide-slate-700">
        <thead className="bg-slate-50 dark:bg-slate-800/80">
          <tr>
            {result.columns.map((c) => (
              <th key={c} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-600 dark:text-slate-300">
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {result.rows.map((row, ri) => (
            <tr key={ri} className="bg-white dark:bg-slate-900/40">
              {result.columns.map((c) => (
                <td key={c} className="whitespace-nowrap px-3 py-2 text-slate-800 dark:text-slate-200">
                  {formatCell(c, row[c], result.entity)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniBarChart({ data }: { data: HrChartPoint[] }) {
  if (data.length === 0) return null;
  return (
    <div className="mt-3 h-40 w-full rounded-lg border border-slate-200 bg-white/80 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Visual summary
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={48} />
          <YAxis tick={{ fontSize: 9 }} width={32} />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              borderRadius: 8,
              border: "1px solid rgb(226 232 240)",
            }}
          />
          <Bar dataKey="value" fill="rgb(99 102 241)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const STARTER_PROMPTS = [
  "How many applications do I have by stage?",
  "Give me candidates with profile Java developer",
  "List interviews in this month",
  "Executive summary: counts across candidates, jobs, pipeline, interviews",
  "Weekly trend of new applications",
];

export default function HrAssistantPanel() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void; onend: (() => void) | null } | null>(null);

  const scrollDown = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetchJson<{ messages: StoredMessage[] }>("/api/hr-assistant/history");
        if (!cancelled) setMessages(data.messages || []);
      } catch {
        if (!cancelled) setLoadError("Could not load chat history.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    scrollDown();
  }, [messages, loading, scrollDown]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  async function sendMessage(text: string) {
    const t = text.trim();
    if (!t || loading) return;
    setLoading(true);
    setLoadError(null);
    const optimisticUser: StoredMessage = {
      id: -Date.now(),
      role: "user",
      content: { text: t },
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimisticUser]);
    setInput("");
    try {
      await apiFetchJson<{ reply: ChatReply }>("/api/hr-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: t }),
      });
      const sync = await apiFetchJson<{ messages: StoredMessage[] }>("/api/hr-assistant/history");
      setMessages(sync.messages || []);
    } catch (e: unknown) {
      setMessages((m) => m.filter((x) => x.id !== optimisticUser.id));
      setLoadError((e as Error)?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function runQuickAction(action: HrDirectAction) {
    if (loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetchJson<{ reply: ChatReply }>("/api/hr-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const sync = await apiFetchJson<{ messages: StoredMessage[] }>("/api/hr-assistant/history");
      setMessages(sync.messages || []);
      if (res.reply?.error) setLoadError(res.reply.error);
    } catch (e: unknown) {
      setLoadError((e as Error)?.message || "Action failed");
    } finally {
      setLoading(false);
    }
  }

  async function clearChat() {
    if (loading) return;
    setLoadError(null);
    try {
      await apiFetchJson("/api/hr-assistant/clear", { method: "POST" });
      setMessages([]);
    } catch {
      setLoadError("Could not clear history.");
    }
  }

  function toggleVoice() {
    if (listening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      setListening(false);
      return;
    }
    const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
    const SR = (w?.SpeechRecognition ?? w?.webkitSpeechRecognition) as
      | (new () => {
          continuous: boolean;
          interimResults: boolean;
          lang: string;
          onresult: ((ev: { results: { 0: { 0: { transcript: string } } } }) => void) | null;
          onerror: (() => void) | null;
          onend: (() => void) | null;
          start: () => void;
          stop: () => void;
        })
      | undefined;
    if (!SR) {
      setLoadError("Voice input is not supported in this browser.");
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (ev) => {
      const t = ev.results[0][0].transcript;
      setInput((prev) => (prev ? `${prev} ${t}` : t).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white shadow-ats-sm shadow-ats-ring dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">HR Assistant</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              NL search · insights · charts · voice · exports
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void clearChat()}
          disabled={loading || messages.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear chat
        </button>
      </div>

      <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <div className="flex flex-wrap gap-1.5">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={loading}
              onClick={() => void sendMessage(p)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:border-indigo-200 hover:bg-indigo-50/80 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:border-indigo-800"
            >
              {p.length > 42 ? `${p.slice(0, 40)}…` : p}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[min(440px,58vh)] space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !loading && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Use the chips above or type below. The assistant remembers your last result for follow-ups like “only
            Hyderabad”.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={`${msg.id}-${msg.created_at}`}
            className={[
              "flex gap-3 rounded-xl px-3 py-2",
              msg.role === "user" ? "bg-slate-50 dark:bg-slate-800/60" : "bg-indigo-50/50 dark:bg-indigo-950/20",
            ].join(" ")}
          >
            <div className="mt-0.5 shrink-0 text-slate-400">
              {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </div>
            <div className="min-w-0 flex-1 text-sm text-slate-800 dark:text-slate-200">
              <div className="whitespace-pre-wrap">{renderInlineBold(msg.content.text || "")}</div>
              {msg.content.insights && (
                <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/80 px-2.5 py-2 text-xs text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/40 dark:text-indigo-100">
                  {renderInlineBold(msg.content.insights)}
                </div>
              )}
              {msg.content.verification && (
                <div className="mt-2 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-2 text-[11px] text-slate-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
                  <span
                    className={[
                      "mr-2 inline-flex rounded-full px-2 py-0.5 font-semibold",
                      msg.content.verification.verified
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                    ].join(" ")}
                  >
                    {msg.content.verification.verified ? "Verified" : "Verification warning"}
                  </span>
                  <span>Definition: {msg.content.verification.definition_used}</span>
                  <span className="ml-2">TZ: {msg.content.verification.timezone_used}</span>
                  <span className="ml-2">Variant: {msg.content.verification.query_variant}</span>
                  {msg.content.verification.sample_ids?.length ? (
                    <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                      Sample IDs: {msg.content.verification.sample_ids.join(", ")}
                    </div>
                  ) : null}
                  {msg.content.verification.warning ? (
                    <div className="mt-1 text-[10px] text-amber-700 dark:text-amber-300">
                      {msg.content.verification.warning}
                    </div>
                  ) : null}
                </div>
              )}
              {msg.content.error && (
                <div className="mt-1 text-xs text-red-600 dark:text-red-400">{msg.content.error}</div>
              )}
              {msg.content.display && msg.content.display.rows.length > 0 && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsv(
                        msg.content.display!.columns,
                        msg.content.display!.rows,
                        `hr-assistant-${msg.id}.csv`
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </button>
                </div>
              )}
              {msg.content.display && (
                <ResultTable
                  result={{
                    columns: msg.content.display.columns,
                    rows: msg.content.display.rows,
                    entity: (msg.content.display.entity as HrEntity | null) ?? null,
                  }}
                />
              )}
              {msg.content.chartSeries && msg.content.chartSeries.length > 0 && (
                <MiniBarChart data={msg.content.chartSeries} />
              )}
              {msg.content.relatedLinks && msg.content.relatedLinks.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.content.relatedLinks.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-indigo-300"
                    >
                      <Link2 className="h-3 w-3" />
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
              {msg.content.suggestedFollowUps && msg.content.suggestedFollowUps.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.content.suggestedFollowUps.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={loading}
                      onClick={() => void sendMessage(s)}
                      className="rounded-full border border-dashed border-indigo-200 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:bg-slate-900/60 dark:text-indigo-200"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              {msg.content.quickActions && msg.content.quickActions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {msg.content.quickActions.map((qa) => (
                    <button
                      key={qa.id}
                      type="button"
                      disabled={loading}
                      onClick={() => void runQuickAction(qa.action)}
                      className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 shadow-sm transition hover:bg-indigo-50 disabled:opacity-50 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking…
          </div>
        )}

        {loadError && <div className="text-center text-xs text-red-600 dark:text-red-400">{loadError}</div>}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-t border-slate-200 p-4 dark:border-slate-700"
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(input);
        }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            title={listening ? "Stop voice" : "Speak"}
            onClick={() => toggleVoice()}
            className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition",
              listening
                ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
            ].join(" ")}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. Narrow those to Bangalore, or count open jobs…"
            className={[
              "min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none",
              "focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20",
              "dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100",
            ].join(" ")}
            disabled={loading}
            aria-label="HR Assistant message"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className={[UI.primaryButton, "inline-flex shrink-0 items-center gap-2 px-4 py-2.5"].join(" ")}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
