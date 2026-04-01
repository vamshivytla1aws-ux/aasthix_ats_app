"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetchJson } from "@/lib/apiClient";

const DEVICE_KEY = "ats-screening-device-id";

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id || id.length < 8) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return `fallback-${Date.now()}`;
  }
}

function localDraftKey(testId: number) {
  return `ats-screening-local-draft-${testId}`;
}

type PublicTest = {
  id: number;
  application_id: number;
  status: "pending" | "submitted" | "expired";
  expires_at: string;
  submitted_at: string | null;
  score: number | null;
  feedback: string | null;
  strengths: string | null;
  weaknesses: string | null;
  quality_flag: "high-quality" | "average" | "weak" | null;
  candidate_name: string;
  job_title: string;
};

type PublicQuestion = {
  id: number;
  question_type: string;
  question_text: string;
  sort_order: number;
  answer_text: string;
};

export default function ScreeningTestPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const testId = Number(params?.id);
  const token = String(search.get("token") || "");

  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<PublicTest | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [warn30, setWarn30] = useState(false);
  const [warn5, setWarn5] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const load = useCallback(async () => {
    if (!Number.isFinite(testId) || !token) {
      setError("Invalid test link.");
      setLoading(false);
      return;
    }
    const dev = deviceId || getOrCreateDeviceId();
    if (!deviceId) setDeviceId(dev);

    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ test: PublicTest; questions: PublicQuestion[] }>(
        `/api/screening-tests/${testId}/public?token=${encodeURIComponent(token)}&device_id=${encodeURIComponent(dev)}`
      );
      setTest(data.test);
      let qs = data.questions || [];
      try {
        const raw = window.localStorage.getItem(localDraftKey(testId));
        if (raw && data.test?.status === "pending") {
          const parsed = JSON.parse(raw) as Record<string, string>;
          qs = qs.map((q) => ({
            ...q,
            answer_text: q.answer_text || parsed[String(q.id)] || "",
          }));
        }
      } catch {
        // ignore
      }
      setQuestions(qs);
    } catch (err: any) {
      setError(err.message || "Failed to load screening test");
    } finally {
      setLoading(false);
    }
  }, [testId, token, deviceId]);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    void load();
  }, [load, deviceId]);

  const remainingMs = useMemo(() => {
    if (!test?.expires_at) return 0;
    return Math.max(0, new Date(test.expires_at).getTime() - Date.now());
  }, [test]);

  const remainingText = useMemo(() => {
    const totalMins = Math.ceil(remainingMs / 60000);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours}h ${mins}m`;
  }, [remainingMs]);

  useEffect(() => {
    if (test?.status !== "pending") return;
    const m30 = 30 * 60 * 1000;
    const m5 = 5 * 60 * 1000;
    setWarn30(remainingMs > 0 && remainingMs <= m30);
    setWarn5(remainingMs > 0 && remainingMs <= m5);
  }, [remainingMs, test?.status]);

  useEffect(() => {
    if (test?.status !== "pending") return;
    const t = setInterval(() => {
      const ms = test?.expires_at ? Math.max(0, new Date(test.expires_at).getTime() - Date.now()) : 0;
      setWarn30(ms > 0 && ms <= 30 * 60 * 1000);
      setWarn5(ms > 0 && ms <= 5 * 60 * 1000);
    }, 30_000);
    return () => clearInterval(t);
  }, [test?.expires_at, test?.status]);

  function persistLocalDraft(qs: PublicQuestion[]) {
    try {
      const map: Record<string, string> = {};
      for (const q of qs) map[String(q.id)] = q.answer_text;
      window.localStorage.setItem(localDraftKey(testId), JSON.stringify(map));
    } catch {
      // ignore
    }
  }

  function setAnswer(questionId: number, value: string) {
    dirtyRef.current = true;
    setQuestions((prev) => {
      const next = prev.map((q) => (q.id === questionId ? { ...q, answer_text: value } : q));
      persistLocalDraft(next);
      return next;
    });
  }

  useEffect(() => {
    if (test?.status !== "pending" || !deviceId || !token) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const answers: Record<string, string> = {};
        for (const q of questions) answers[String(q.id)] = q.answer_text;
        await apiFetchJson(`/api/screening-tests/${testId}/draft`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, device_id: deviceId, answers }),
        });
      } catch {
        // offline / migration — local draft still works
      }
    }, 900);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [questions, test?.status, testId, token, deviceId]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (test?.status !== "pending" || !dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [test?.status]);

  async function submit() {
    if (!test) return;
    if (test.status !== "pending") return;
    if (remainingMs <= 0) {
      setError("This test is expired. Please contact recruiter for resend.");
      return;
    }
    if (questions.some((q) => !q.answer_text.trim())) {
      setError("Please answer all questions.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await apiFetchJson(`/api/screening-tests/${test.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          answers: questions.map((q) => ({ question_id: q.id, answer_text: q.answer_text })),
        }),
      });
      dirtyRef.current = false;
      try {
        window.localStorage.removeItem(localDraftKey(testId));
      } catch {
        // ignore
      }
      await load();
    } catch (err: any) {
      setError(err.message || "Failed to submit screening test");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xl font-bold text-slate-900">Screening Test</div>
        <div className="mt-1 text-sm text-slate-600">
          {test?.candidate_name || "Candidate"} - {test?.job_title || "Role"}
        </div>
        {test?.status === "pending" ? (
          <div className="mt-3 inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            Time left: {remainingText}
          </div>
        ) : test?.status === "submitted" ? (
          <div className="mt-3 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Submitted
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            Expired
          </div>
        )}
        {test?.status === "pending" ? (
          <p className="mt-3 text-xs text-slate-500">
            Answers autosave on this device. You can close and resume with the same link on this browser until you submit once.
          </p>
        ) : null}
      </div>

      {warn30 && test?.status === "pending" ? (
        <div
          className={[
            "rounded-xl border px-4 py-3 text-sm",
            warn5 ? "border-rose-200 bg-rose-50 text-rose-900" : "border-amber-200 bg-amber-50 text-amber-900",
          ].join(" ")}
        >
          {warn5
            ? "Less than 5 minutes left — submit soon or your link may expire."
            : "Less than 30 minutes remaining to complete this screening."}
        </div>
      ) : null}

      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {questions.map((q, idx) => (
          <div key={q.id} className="rounded-xl border border-slate-200 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Q{idx + 1} - {q.question_type}
            </div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{q.question_text}</div>
            <textarea
              value={q.answer_text}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              rows={4}
              disabled={test?.status !== "pending" || submitting}
              className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              placeholder="Write your answer..."
            />
          </div>
        ))}
      </div>

      {test?.status === "pending" ? (
        <button
          type="button"
          onClick={submit}
          disabled={submitting || remainingMs <= 0}
          className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit Once"}
        </button>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">Evaluation</div>
          <div className="mt-2 text-sm text-slate-700">
            Score: {test?.score == null ? "Pending" : `${test.score} / 100`}
          </div>
          <div className="mt-1 text-sm text-slate-700">Quality: {test?.quality_flag ?? "Pending"}</div>
          {test?.feedback ? <div className="mt-2 text-sm text-slate-700">Feedback: {test.feedback}</div> : null}
        </div>
      )}
    </div>
  );
}
