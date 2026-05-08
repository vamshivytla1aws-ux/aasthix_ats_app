"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { normalizeResumeLink } from "@/lib/resumeLink";

type Candidate = {
  id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  created_at?: string | null;
  linkedin_url?: string | null;
  website_url?: string | null;
  location?: string | null;
  resume_url?: string | null;
  skills?: string | null;
  applied_companies?: string | null;
  applied_job_titles?: string | null;
  applied_company_names?: string | null;
  current_salary?: number | null;
  expected_salary?: number | null;
  expected_percentage?: number | null;
  status?: "Active" | "Placed" | string | null;
  source?: string | null;
};

export default function CandidateTable({
  data,
  onEdit,
  onDelete,
}: {
  data: Candidate[];
  onEdit: (candidate: Candidate) => void;
  onDelete: (candidate: Candidate) => Promise<void>;
}) {
  const [resumeModalUrl, setResumeModalUrl] = useState<string | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Candidate | null>(null);
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const isPdf = useMemo(() => {
    if (!resumeModalUrl) return false;
    const clean = resumeModalUrl.split("?")[0].split("#")[0];
    return clean.toLowerCase().endsWith(".pdf");
  }, [resumeModalUrl]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!openActionsId) return;
      const target = e.target as Node | null;
      if (actionsRef.current && target && actionsRef.current.contains(target)) return;
      setOpenActionsId(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenActionsId(null);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openActionsId]);

  function toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string") {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  function formatINR(value: unknown) {
    const n = toNumber(value);
    if (n === null) return "—";
    try {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
    } catch {
      return `₹${Math.round(n).toLocaleString("en-IN")}`;
    }
  }

  function formatPct(value: unknown) {
    const n = toNumber(value);
    if (n === null) return "—";
    return `${Math.round(n)}%`;
  }

  function pctTone(value: unknown) {
    const n = toNumber(value);
    if (n === null) return "text-slate-500";
    if (n > 50) return "text-red-600";
    if (n >= 20) return "text-amber-600";
    return "text-emerald-600";
  }

  function formatCreatedDate(value: string | null | undefined) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    try {
      return new Intl.DateTimeFormat("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(d);
    } catch {
      return d.toLocaleDateString();
    }
  }

  function statusBadge(status: string | null | undefined) {
    const s = (status ?? "").toLowerCase();
    const cls =
      s === "placed"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-slate-50 text-slate-700 ring-slate-200";
    const label = status && status.trim().length ? status : "Active";
    return (
      <span className={["inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1", cls].join(" ")}>
        {label}
      </span>
    );
  }

  return (
    <>
      {deleteTarget && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDeleteTarget(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-lg rounded-2xl bg-white shadow-md border border-slate-200 p-6">
              <div className="text-lg font-semibold text-slate-900">Delete candidate</div>
              <div className="mt-2 text-sm text-slate-700">
                Deleting candidate, are you sure?
              </div>
              <div className="mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700">
                <div><span className="font-semibold">Name:</span> {deleteTarget.full_name}</div>
                <div><span className="font-semibold">Email:</span> {deleteTarget.email}</div>
                <div><span className="font-semibold">Phone:</span> {deleteTarget.phone ?? "—"}</div>
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50 transition-all duration-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await onDelete(deleteTarget);
                    } finally {
                      setDeleteTarget(null);
                    }
                  }}
                  className="rounded-xl bg-red-600 text-white px-3 py-2 text-sm hover:bg-red-700 transition-all duration-200"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resumeModalUrl && (
        <div className="fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/30" onClick={() => setResumeModalUrl(null)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-5xl rounded-2xl bg-white shadow-md border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-slate-50">
                <div className="text-sm font-semibold text-slate-900">Resume</div>
                <div className="flex items-center gap-2">
                  <a
                    href={resumeModalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-blue-700 underline hover:text-blue-800"
                  >
                    Open in new tab
                  </a>
                  <button
                    type="button"
                    onClick={() => setResumeModalUrl(null)}
                    className="rounded-xl border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 transition-all duration-200"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="h-[70vh] bg-white">
                {isPdf ? (
                  <iframe title="Resume PDF" src={resumeModalUrl} className="h-full w-full" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center p-8 text-center">
                    <div className="space-y-2">
                      <div className="text-base font-semibold text-slate-900">Preview not available</div>
                      <div className="text-sm text-slate-600">
                        This file type can’t be embedded here. Use “Open in new tab”.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="-mx-1 overflow-x-auto overflow-y-visible rounded-2xl border border-slate-200 bg-white shadow-sm sm:mx-0">
        <table className="min-w-[1100px] divide-y divide-slate-200 sm:min-w-full">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Full name
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Email
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Phone
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Location
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Source
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Created Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              LinkedIn
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Skillset
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Applied Company
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Job Title
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Company Name
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Current Salary
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Expected Salary
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Expected %
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              Resume
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-[15px]">
          {data.map((c) => (
            <tr
              key={c.id}
              className="odd:bg-slate-50/50 hover:bg-slate-100/60 transition-colors"
            >
              <td className="px-4 py-3.5 whitespace-nowrap font-semibold text-slate-900">
                {c.full_name}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <a className="text-blue-700 hover:underline" href={`mailto:${c.email}`}>
                  {c.email}
                </a>
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{c.phone ?? "—"}</td>
              <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{c.location ?? "—"}</td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                <span
                  className={[
                    "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                    String(c.source || "UI") === "Careers Page"
                      ? "bg-indigo-50 text-indigo-800 ring-indigo-200"
                      : "bg-slate-100 text-slate-700 ring-slate-200",
                  ].join(" ")}
                >
                  {c.source || "UI"}
                </span>
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">
                {formatCreatedDate(c.created_at)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                {c.linkedin_url ? (
                  <a
                    href={c.linkedin_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    LinkedIn
                  </a>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3.5">
                {(() => {
                  const fromSkills =
                    (c.skills ?? "")
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean) ?? [];
                  const items = fromSkills;

                  if (!items.length) return <span className="text-slate-400">No skills</span>;

                  return (
                    <div className="flex flex-wrap gap-1.5 max-w-[360px]">
                      {items.slice(0, 10).map((s) => (
                        <span
                          key={s}
                          className="bg-gray-100 px-2 py-1 rounded-md text-xs text-slate-700"
                        >
                          {s}
                        </span>
                      ))}
                      {items.length > 10 && (
                        <span className="text-xs text-slate-500">+{items.length - 10} more</span>
                      )}
                    </div>
                  );
                })()}
              </td>
              <td className="px-4 py-3.5 text-slate-700">
                {c.applied_companies && c.applied_companies.trim().length > 0 ? (
                  <span className="truncate block max-w-[260px]" title={c.applied_companies}>
                    {c.applied_companies}
                  </span>
                ) : (
                  <span className="text-slate-400">No applications</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-slate-700">
                {c.applied_job_titles && c.applied_job_titles.trim().length > 0 ? (
                  <span className="truncate block max-w-[260px]" title={c.applied_job_titles}>
                    {c.applied_job_titles}
                  </span>
                ) : (
                  <span className="text-slate-400">Not assigned</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-slate-700">
                {c.applied_company_names && c.applied_company_names.trim().length > 0 ? (
                  <span className="truncate block max-w-[260px]" title={c.applied_company_names}>
                    {c.applied_company_names}
                  </span>
                ) : (
                  <span className="text-slate-400">Not assigned</span>
                )}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-slate-700">
                {formatINR(c.current_salary)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-right tabular-nums text-slate-700">
                {formatINR(c.expected_salary)}
              </td>
              <td className={["px-4 py-3.5 whitespace-nowrap text-right tabular-nums font-semibold", pctTone(c.expected_percentage)].join(" ")}>
                {formatPct(c.expected_percentage)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                {statusBadge(c.status)}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap">
                {c.resume_url ? (
                  <a
                    href={normalizeResumeLink(c.resume_url) || c.resume_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-700 underline hover:text-blue-800 transition-colors"
                    onClick={(e) => {
                      const openUrl = normalizeResumeLink(c.resume_url) || c.resume_url || "";
                      const clean = openUrl.split("?")[0].split("#")[0];
                      const pdf = clean.toLowerCase().endsWith(".pdf");
                      if (pdf && openUrl) {
                        e.preventDefault();
                        setResumeModalUrl(openUrl);
                      }
                    }}
                  >
                    View Resume
                  </a>
                ) : (
                  <span className="text-slate-400">No Resume</span>
                )}
              </td>
              <td className="px-4 py-3.5 whitespace-nowrap text-right">
                <div className="relative inline-flex items-center gap-2" ref={openActionsId === c.id ? actionsRef : undefined}>
                  <Link
                    href={`/candidates/${c.id}`}
                    className="inline-flex min-h-[40px] items-center rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-all duration-200 lg:min-h-0"
                  >
                    Profile
                  </Link>

                  <button
                    type="button"
                    onClick={() => setOpenActionsId((prev) => (prev === c.id ? null : c.id))}
                    className="inline-flex min-h-[40px] items-center rounded-xl border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-all duration-200 lg:min-h-0"
                    aria-haspopup="menu"
                    aria-expanded={openActionsId === c.id}
                  >
                    ⋮
                  </button>

                  {openActionsId === c.id && (
                    <div
                      role="menu"
                      className="absolute right-0 bottom-full mb-2 w-40 bg-white shadow-md rounded-lg p-2 border border-slate-200 z-50"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionsId(null);
                          onEdit(c);
                        }}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md"
                        role="menuitem"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4 text-slate-600"
                          aria-hidden="true"
                          fill="currentColor"
                        >
                          <path d="M13.586 2.586a2 2 0 0 1 2.828 2.828l-9.5 9.5a1 1 0 0 1-.46.263l-3.5 1a1 1 0 0 1-1.237-1.237l1-3.5a1 1 0 0 1 .263-.46l9.5-9.5Zm1.414 1.414a1 1 0 0 0-1.414 0l-.793.793 1.414 1.414.793-.793a1 1 0 0 0 0-1.414ZM12.086 6.207 4.207 14.086l-.57 1.995 1.995-.57 7.879-7.879-1.414-1.414Z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenActionsId(null);
                          setDeleteTarget(c);
                        }}
                        className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md text-red-500"
                        role="menuitem"
                      >
                        <svg
                          viewBox="0 0 20 20"
                          className="h-4 w-4 text-red-500"
                          aria-hidden="true"
                          fill="currentColor"
                        >
                          <path d="M6 2a1 1 0 0 0-1 1v1H3.5a1 1 0 1 0 0 2H4v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6h.5a1 1 0 1 0 0-2H15V3a1 1 0 0 0-1-1H6Zm1 3V4h6v1H7Zm1.5 3a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Zm5 0a1 1 0 0 1 1 1v7a1 1 0 1 1-2 0V9a1 1 0 0 1 1-1Z" />
                        </svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr>
              <td colSpan={16} className="px-4 py-10 text-center text-slate-500">
                No candidates yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}
