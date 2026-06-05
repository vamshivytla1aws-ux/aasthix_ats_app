"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Files, Sparkles, UploadCloud, Wand2, X } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import Toast from "@/components/Toast";

type Job = { id: number; title: string; company?: string | null };

type ParsedRow = {
  row_id: string;
  file_name: string;
  parse_ok: boolean;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  skills: string | null;
  resume_url: string | null;
  confidence: {
    full_name: number;
    email: number;
    phone: number;
    location: number;
    linkedin_url: number;
    skills: number;
    overall: number;
  };
  duplicate_match: {
    by_email: boolean;
    by_phone: boolean;
    existing: Array<{ id: number; full_name: string; email: string | null; phone: string | null }>;
  };
  parse_error?: string;
};

type BulkParseResponse = {
  total: number;
  parsed_ok: number;
  parsed_failed: number;
  rows: ParsedRow[];
};

type BulkImportResponse = {
  total: number;
  imported: number;
  failed: number;
  results: Array<{
    file_name: string;
    ok: boolean;
    candidate_id?: number;
    full_name?: string | null;
    email?: string | null;
    reason?: string;
  }>;
};

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export default function BulkCandidateIntake({ onImported }: { onImported: () => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [createApplication, setCreateApplication] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>("");
  const [report, setReport] = useState<BulkImportResponse | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = await apiFetchJson<Job[]>("/api/jobs");
        if (!cancelled) setJobs(j);
      } catch {
        // optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canParse = useMemo(() => files.length > 0 && !parsing && !importing, [files.length, parsing, importing]);
  const selectedCount = useMemo(() => rows.filter((r) => selected[r.row_id]).length, [rows, selected]);
  const selectedWithDuplicate = useMemo(
    () => rows.filter((r) => selected[r.row_id] && (r.duplicate_match.by_email || r.duplicate_match.by_phone)),
    [rows, selected]
  );
  const canImport = useMemo(() => {
    if (selectedCount <= 0 || parsing || importing) return false;
    if (createApplication && !selectedJobId) return false;
    return true;
  }, [selectedCount, parsing, importing, createApplication, selectedJobId]);

  function addFiles(nextList: FileList | null) {
    if (!nextList) return;
    setReport(null);
    setRows([]);
    setSelected({});
    const next = Array.from(nextList);
    setFiles((prev) => {
      const map = new Map<string, File>();
      for (const f of prev) map.set(`${f.name}:${f.size}`, f);
      for (const f of next) map.set(`${f.name}:${f.size}`, f);
      return Array.from(map.values()).slice(0, 50);
    });
  }

  function removeFile(name: string, size: number) {
    setFiles((prev) => prev.filter((f) => !(f.name === name && f.size === size)));
  }

  async function runParse() {
    if (!canParse) return;
    setParsing(true);
    setToast(null);
    setReport(null);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("files", f);
      const res = await apiFetchJson<BulkParseResponse>("/api/candidates/bulk-parse", {
        method: "POST",
        body: fd,
      });
      setRows(res.rows);
      const nextSelected: Record<string, boolean> = {};
      for (const row of res.rows) {
        nextSelected[row.row_id] = row.parse_ok && Boolean(row.email) && Boolean(row.full_name);
      }
      setSelected(nextSelected);
      setToast({
        message: `Parsed ${res.parsed_ok}/${res.total}. Review and edit rows before importing.`,
        variant: "success",
      });
    } catch (err: any) {
      setToast({ message: err.message || "Bulk parse failed", variant: "error" });
    } finally {
      setParsing(false);
    }
  }

  function updateRow(rowId: string, patch: Partial<ParsedRow>) {
    setRows((prev) => prev.map((r) => (r.row_id === rowId ? { ...r, ...patch } : r)));
  }

  async function runBulkImport() {
    if (!canImport) return;
    setImporting(true);
    setToast(null);
    setReport(null);
    try {
      const payload = {
        options: {
          create_application: createApplication,
          job_id: createApplication ? Number(selectedJobId) : null,
        },
        rows: rows
          .filter((r) => selected[r.row_id])
          .map((r) => ({
            file_name: r.file_name,
            full_name: (r.full_name || "").trim() || null,
            email: (r.email || "").trim() || null,
            phone: (r.phone || "").trim() || null,
            location: (r.location || "").trim() || null,
            linkedin_url: (r.linkedin_url || "").trim() || null,
            skills: (r.skills || "").trim() || null,
            resume_url: r.resume_url || null,
          })),
      };
      const fd = new FormData();
      fd.append("manifest", JSON.stringify(payload));
      const selectedFileNames = new Set(payload.rows.map((r) => r.file_name));
      for (const file of files) {
        if (selectedFileNames.has(file.name)) fd.append("files", file);
      }

      const res = await apiFetchJson<BulkImportResponse>("/api/candidates/bulk-import", {
        method: "POST",
        body: fd,
      });
      setReport(res);
      onImported();
      if (res.failed === 0) {
        setToast({ message: `Imported ${res.imported} candidate(s) successfully.`, variant: "success" });
      } else {
        setToast({ message: `Imported ${res.imported}/${res.total}. Check failed rows below.`, variant: "error" });
      }
    } catch (err: any) {
      setToast({ message: err.message || "Bulk import failed", variant: "error" });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-100">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            AI bulk intake
          </div>
          <h3 className="mt-2 text-base font-semibold text-slate-900">Upload multiple resumes</h3>
          <p className="mt-1 text-sm text-slate-600">
            Two-step intake: parse resumes with AI confidence, review duplicate warnings, then import selected rows.
          </p>
        </div>
        <label
          htmlFor="bulk-resume-input"
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <UploadCloud className="h-4 w-4" aria-hidden />
          Select files
        </label>
      </div>

      <input
        id="bulk-resume-input"
        type="file"
        multiple
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(e) => addFiles(e.target.files)}
        disabled={importing || parsing}
      />

      <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-3">
        {files.length === 0 ? (
          <div className="text-sm text-slate-500">No files selected yet.</div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Files className="h-4 w-4 text-slate-500" aria-hidden />
              {files.length} file(s) selected
            </div>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {files.map((f) => (
                <div key={`${f.name}:${f.size}`} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-xs">
                  <span className="truncate pr-3 text-slate-700">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => removeFile(f.name, f.size)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    aria-label={`Remove ${f.name}`}
                    disabled={importing || parsing}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={runParse}
          disabled={!canParse}
          className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100 disabled:opacity-45"
        >
          {parsing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-400/40 border-t-indigo-700" /> : <Wand2 className="h-4 w-4" />}
          {parsing ? "Parsing..." : "Parse resumes"}
        </button>
        <button
          type="button"
          onClick={runBulkImport}
          disabled={!canImport}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-45"
        >
          {importing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Sparkles className="h-4 w-4" />}
          {importing ? "Importing..." : `Import selected (${selectedCount})`}
        </button>
      </div>

      {rows.length > 0 ? (
        <>
          <div className="mt-4 rounded-xl border border-slate-200 bg-amber-50/60 p-3 text-xs text-amber-900">
            <div className="font-semibold">Duplicate warning panel</div>
            {selectedWithDuplicate.length === 0 ? (
              <div className="mt-1 text-emerald-700">No duplicate warnings for selected rows.</div>
            ) : (
              <div className="mt-2 space-y-1">
                {selectedWithDuplicate.map((r) => (
                  <div key={r.row_id} className="rounded-lg bg-white px-2 py-1.5">
                    <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-amber-600" />
                    {r.file_name}: duplicate by {r.duplicate_match.by_email ? "email" : ""}
                    {r.duplicate_match.by_email && r.duplicate_match.by_phone ? " and " : ""}
                    {r.duplicate_match.by_phone ? "phone" : ""}
                    {r.duplicate_match.existing.length > 0 ? ` -> ${r.duplicate_match.existing.map((x) => x.full_name).join(", ")}` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input
                type="checkbox"
                checked={createApplication}
                onChange={(e) => setCreateApplication(e.target.checked)}
                disabled={importing || parsing}
              />
              Create application too (auto-push to pipeline Applied stage)
            </label>
            {createApplication ? (
              <div className="mt-2">
                <select
                  className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  disabled={importing || parsing}
                >
                  <option value="">Select job for pipeline application</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={String(j.id)}>
                      {j.title}
                      {j.company ? ` · ${j.company}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-900">Review parsed rows before save</div>
              <button
                type="button"
                onClick={() => {
                  const all = rows.every((r) => selected[r.row_id]);
                  const next: Record<string, boolean> = {};
                  for (const r of rows) next[r.row_id] = !all;
                  setSelected(next);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                disabled={importing || parsing}
              >
                Toggle all
              </button>
            </div>
            <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-200 bg-white">
              <table className="min-w-[1220px] w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-2 text-left">Import</th>
                    <th className="px-2 py-2 text-left">File</th>
                    <th className="px-2 py-2 text-left">Confidence</th>
                    <th className="px-2 py-2 text-left">Full name</th>
                    <th className="px-2 py-2 text-left">Email</th>
                    <th className="px-2 py-2 text-left">Phone</th>
                    <th className="px-2 py-2 text-left">Location</th>
                    <th className="px-2 py-2 text-left">LinkedIn</th>
                    <th className="px-2 py-2 text-left">Skills</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.row_id} className="border-t border-slate-100 align-top">
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[r.row_id])}
                          onChange={(e) => setSelected((prev) => ({ ...prev, [r.row_id]: e.target.checked }))}
                          disabled={importing || parsing}
                        />
                      </td>
                      <td className="px-2 py-2 text-slate-700">{r.file_name}</td>
                      <td className="px-2 py-2">
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{pct(r.confidence.overall)}</span>
                        {(r.duplicate_match.by_email || r.duplicate_match.by_phone) ? (
                          <div className="mt-1 text-[10px] font-semibold text-amber-700">Duplicate</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2"><input value={r.full_name || ""} onChange={(e) => updateRow(r.row_id, { full_name: e.target.value })} className="w-40 rounded border border-slate-200 px-2 py-1" disabled={importing || parsing} /></td>
                      <td className="px-2 py-2"><input value={r.email || ""} onChange={(e) => updateRow(r.row_id, { email: e.target.value })} className="w-52 rounded border border-slate-200 px-2 py-1" disabled={importing || parsing} /></td>
                      <td className="px-2 py-2"><input value={r.phone || ""} onChange={(e) => updateRow(r.row_id, { phone: e.target.value })} className="w-32 rounded border border-slate-200 px-2 py-1" disabled={importing || parsing} /></td>
                      <td className="px-2 py-2"><input value={r.location || ""} onChange={(e) => updateRow(r.row_id, { location: e.target.value })} className="w-40 rounded border border-slate-200 px-2 py-1" disabled={importing || parsing} /></td>
                      <td className="px-2 py-2"><input value={r.linkedin_url || ""} onChange={(e) => updateRow(r.row_id, { linkedin_url: e.target.value })} className="w-52 rounded border border-slate-200 px-2 py-1" disabled={importing || parsing} /></td>
                      <td className="px-2 py-2"><input value={r.skills || ""} onChange={(e) => updateRow(r.row_id, { skills: e.target.value })} className="w-64 rounded border border-slate-200 px-2 py-1" disabled={importing || parsing} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {report ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="text-sm font-semibold text-slate-900">
            Import report: {report.imported}/{report.total} imported ({report.failed} failed)
          </div>
          <div className="mt-2 max-h-56 space-y-1 overflow-y-auto pr-1 text-xs">
            {report.results.map((r, idx) => (
              <div key={`${r.file_name}-${idx}`} className="rounded-lg bg-white px-3 py-2">
                {r.ok ? (
                  <span className="text-emerald-700">
                    {r.file_name} {"->"} {r.full_name || "Candidate"} ({r.email || "no email"})
                  </span>
                ) : (
                  <span className="text-rose-700">
                    {r.file_name} {"->"} {r.reason || "Failed"}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
