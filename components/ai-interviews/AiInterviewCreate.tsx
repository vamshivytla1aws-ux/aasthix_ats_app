"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = {
  id: number;
  title?: string;
  full_name?: string;
  email?: string;
};
export default function AiInterviewCreate() {
  const router = useRouter();
  const [jobs, setJobs] = useState<Option[]>([]);
  const [candidates, setCandidates] = useState<Option[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    job_id: "",
    candidate_id: "",
    title: "AASTHIX - AI Interview",
    instructions:
      "Answer each question clearly using examples from your experience.",
    difficulty: "MIXED",
    skills: "",
    question_count: 7,
    duration_minutes: 40,
    expires_at: "",
    interview_mode: "ADAPTIVE",
    project_questions_enabled: true,
    min_project_questions: 2,
    max_followups_per_topic: 2,
    scenario_percentage: 15,
    recruiter_experience_override: "",
    coding_enabled: false,
    behavioral_enabled: false,
    allow_fundamentals_for_senior: false,
    recording_enabled: true,
    screen_share_enabled: false,
    fullscreen_required: true,
    face_monitoring_enabled: true,
    gaze_monitoring_enabled: true,
  });
  useEffect(() => {
    void Promise.all([
      fetch("/api/jobs").then((r) => r.json()),
      fetch("/api/candidates").then((r) => r.json()),
    ]).then(([j, c]) => {
      setJobs(Array.isArray(j) ? j : j.jobs || j.data || []);
      setCandidates(Array.isArray(c) ? c : c.candidates || c.data || []);
    });
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        job_id: Number(form.job_id),
        candidate_id: Number(form.candidate_id),
        skills: form.skills
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        expires_at: new Date(form.expires_at).toISOString(),
        recruiter_experience_override:
          form.recruiter_experience_override === ""
            ? null
            : Number(form.recruiter_experience_override),
      };
      const r = await fetch("/api/ai-interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Could not create AI interview");
      if (d.public_url)
        sessionStorage.setItem(
          `ai-interview-link:${d.interview.id}`,
          d.public_url,
        );
      router.push(`/ai-interviews/${d.interview.id}`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not create AI interview",
      );
      setSaving(false);
    }
  }
  const input =
    "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">
            Create AI Interview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Questions are generated from the selected job and candidate resume,
            then remain editable before activation.
          </p>
        </div>
        <Link
          href="/ai-interviews"
          className="text-sm font-semibold text-slate-600"
        >
          Back
        </Link>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">
          Job
          <select
            required
            value={form.job_id}
            onChange={(e) => {
              const job = jobs.find(
                (item) => String(item.id) === e.target.value,
              );
              setForm({
                ...form,
                job_id: e.target.value,
                title: job?.title
                  ? `AASTHIX - AI Interview - ${job.title}`
                  : "AASTHIX - AI Interview",
              });
            }}
            className={input}
          >
            <option value="">Select job</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Candidate
          <select
            required
            value={form.candidate_id}
            onChange={(e) => setForm({ ...form, candidate_id: e.target.value })}
            className={input}
          >
            <option value="">Select candidate</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.email ? `· ${c.email}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Interview title
          <input
            readOnly
            required
            value={form.title}
            className={`${input} bg-slate-50`}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Generated automatically from the selected job.
          </span>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Interview mode
          <select
            value={form.interview_mode}
            onChange={(e) =>
              setForm({ ...form, interview_mode: e.target.value })
            }
            className={input}
          >
            <option value="ADAPTIVE">Adaptive (recommended)</option>
            <option value="FIXED">Fixed questionnaire</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Difficulty
          <select
            value={form.difficulty}
            onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
            className={input}
          >
            <option value="MIXED">Mixed</option>
            <option value="BEGINNER">Beginner</option>
            <option value="INTERMEDIATE">Intermediate</option>
            <option value="ADVANCED">Advanced</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Skills to evaluate
          <input
            value={form.skills}
            onChange={(e) => setForm({ ...form, skills: e.target.value })}
            placeholder="Python, system design, AWS"
            className={input}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          {form.interview_mode === "ADAPTIVE"
            ? "Maximum questions"
            : "Questions"}
          <input
            type="number"
            min={1}
            max={20}
            value={form.question_count}
            onChange={(e) =>
              setForm({ ...form, question_count: Number(e.target.value) })
            }
            className={input}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Duration (minutes)
          <input
            type="number"
            min={5}
            max={180}
            value={form.duration_minutes}
            onChange={(e) =>
              setForm({ ...form, duration_minutes: Number(e.target.value) })
            }
            className={input}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700">
          Link expiry
          <input
            required
            type="datetime-local"
            value={form.expires_at}
            onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
            className={input}
          />
        </label>
        <label className="text-sm font-semibold text-slate-700 md:col-span-2">
          Instructions
          <textarea
            rows={4}
            value={form.instructions}
            onChange={(e) => setForm({ ...form, instructions: e.target.value })}
            className={input}
          />
        </label>
      </section>
      {form.interview_mode === "ADAPTIVE" && (
        <section className="rounded-2xl border border-cyan-200 bg-cyan-50/50 p-5 shadow-sm">
          <div>
            <h2 className="font-bold text-slate-950">
              Adaptive interview configuration
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              The server asks one evidence-based question at a time. Internal
              scores and strategy are never shown to the candidate.
            </p>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">
              Minimum project questions
              <input
                type="number"
                min={0}
                max={10}
                value={form.min_project_questions}
                onChange={(e) =>
                  setForm({
                    ...form,
                    min_project_questions: Number(e.target.value),
                  })
                }
                className={input}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Max follow-ups per topic
              <input
                type="number"
                min={0}
                max={5}
                value={form.max_followups_per_topic}
                onChange={(e) =>
                  setForm({
                    ...form,
                    max_followups_per_topic: Number(e.target.value),
                  })
                }
                className={input}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Scenario coverage %
              <input
                type="number"
                min={0}
                max={50}
                value={form.scenario_percentage}
                onChange={(e) =>
                  setForm({
                    ...form,
                    scenario_percentage: Number(e.target.value),
                  })
                }
                className={input}
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Relevant experience override
              <input
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={form.recruiter_experience_override}
                onChange={(e) =>
                  setForm({
                    ...form,
                    recruiter_experience_override: e.target.value,
                  })
                }
                placeholder="Use resume"
                className={input}
              />
            </label>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["project_questions_enabled", "Ask about resume projects"],
                ["coding_enabled", "Enable coding questions"],
                ["behavioral_enabled", "Enable behavioural questions"],
                [
                  "allow_fundamentals_for_senior",
                  "Allow fundamentals for senior candidates",
                ],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-white p-3 text-sm text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(e) =>
                    setForm({ ...form, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold text-slate-900">Interview controls</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(
            [
              ["recording_enabled", "Record camera and mic"],
              ["screen_share_enabled", "Require screen share"],
              ["fullscreen_required", "Require fullscreen"],
              ["face_monitoring_enabled", "Face presence"],
              ["gaze_monitoring_enabled", "Approx. looking away"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
              />
              {label}
            </label>
          ))}
        </div>
      </section>
      <div className="flex justify-end">
        <button
          disabled={saving}
          className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving
            ? "Creating and generating questions..."
            : "Create and generate questions"}
        </button>
      </div>
    </form>
  );
}
