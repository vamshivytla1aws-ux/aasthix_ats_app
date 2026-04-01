"use client";

import React, { useCallback, useState } from "react";
import useSWR from "swr";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import StatusBadge from "./StatusBadge";

type TeamMember = {
  id: number;
  job_id: number;
  user_id: number;
  role: string;
  created_at: string;
  user_email?: string;
  user_name?: string;
  job_title?: string;
};

type UserOption = { id: number; full_name: string; email: string };

const ROLE_LABELS: Record<string, string> = {
  hiring_manager: "Hiring Manager",
  recruiter: "Recruiter",
  coordinator: "Coordinator",
  sourcer: "Sourcer",
  observer: "Observer",
};

const ROLES = ["hiring_manager", "recruiter", "coordinator", "sourcer", "observer"] as const;

export default function JobTeamPanel({
  jobId,
  canManage,
  onToast,
}: {
  jobId: number;
  canManage: boolean;
  onToast?: (message: string, variant: "success" | "error") => void;
}) {
  const { data, isLoading, mutate } = useSWR<{ members: TeamMember[] }>(
    `/api/job-team?job_id=${jobId}`,
    (url: string) => apiFetchJson<{ members: TeamMember[] }>(url)
  );

  const { data: usersData } = useSWR<{ users: UserOption[] }>(
    canManage ? "/api/admin/users-permissions" : null,
    (url: string) => apiFetchJson<{ users: UserOption[] }>(url)
  );

  const members = data?.members ?? [];
  const users = usersData?.users ?? [];

  const [busy, setBusy] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addRole, setAddRole] = useState<string>("recruiter");

  const toast = useCallback(
    (msg: string, v: "success" | "error") => onToast?.(msg, v),
    [onToast]
  );

  const addMember = useCallback(async () => {
    const uid = Number(addUserId);
    if (!uid || !addRole) return;
    setBusy(true);
    try {
      await apiFetchJson("/api/job-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_id: jobId, user_id: uid, role: addRole }),
      });
      toast(`Added ${ROLE_LABELS[addRole] ?? addRole}.`, "success");
      setAddUserId("");
      void mutate();
    } catch (e) {
      if (e instanceof ApiError) toast(e.message, "error");
      else toast("Failed to add member", "error");
    } finally {
      setBusy(false);
    }
  }, [jobId, addUserId, addRole, mutate, toast]);

  const removeMember = useCallback(
    async (member: TeamMember) => {
      setBusy(true);
      try {
        await apiFetchJson("/api/job-team", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: member.id }),
        });
        toast(`Removed ${member.user_email ?? member.user_name ?? "member"}.`, "success");
        void mutate();
      } catch (e) {
        if (e instanceof ApiError) toast(e.message, "error");
        else toast("Failed to remove member", "error");
      } finally {
        setBusy(false);
      }
    },
    [mutate, toast]
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Job team
        <span className="ml-2 text-xs font-normal text-slate-400">
          ({members.length} member{members.length !== 1 ? "s" : ""})
        </span>
      </h3>

      {isLoading ? (
        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      ) : members.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          No team members assigned yet.{canManage ? " Add below." : ""}
        </p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {members.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {(m.user_name || m.user_email || "?")
                  .split(/[\s@]/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {m.user_name || m.user_email || `User #${m.user_id}`}
                </div>
                {m.user_email && m.user_name ? (
                  <div className="truncate text-[11px] text-slate-400">{m.user_email}</div>
                ) : null}
              </div>
              <StatusBadge status={ROLE_LABELS[m.role] ?? m.role} />
              {canManage && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeMember(m)}
                  className="ml-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">User</label>
            <select
              value={addUserId}
              onChange={(e) => setAddUserId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Select user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">Role</label>
            <select
              value={addRole}
              onChange={(e) => setAddRole(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={busy || !addUserId}
            onClick={() => void addMember()}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      )}
    </div>
  );
}
