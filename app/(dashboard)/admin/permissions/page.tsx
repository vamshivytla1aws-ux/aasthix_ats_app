"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, Mail, ScrollText } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import { INVITE_ROLES } from "@/lib/rbacConstants";

type UserRow = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
};

export default function AdminPermissionsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>(["admin", "user"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(INVITE_ROLES[0] ?? "recruiter");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ users: UserRow[]; permission_keys: string[]; roles?: string[] }>(
        "/api/admin/users-permissions"
      );
      setUsers(data.users || []);
      setKeys(data.permission_keys || []);
      if (Array.isArray(data.roles) && data.roles.length) setRoles(data.roles);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load permissions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveUser(id: number, patch: { role?: string; permissions?: Record<string, boolean> }) {
    setSaving(id);
    setError(null);
    try {
      await apiFetchJson("/api/admin/users-permissions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: id, ...patch }),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save permission";
      setError(msg);
    } finally {
      setSaving(null);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteMessage(null);
    setError(null);
    try {
      const data = await apiFetchJson<{ inviteUrl?: string }>("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setInviteMessage("Invite created. Copy the link below and send it to the user.");
      if (data.inviteUrl) {
        setInviteMessage(`Invite link (copy): ${data.inviteUrl}`);
      }
      setInviteEmail("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create invite";
      setError(msg);
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <div className={["space-y-4", UI.pageShell].join(" ")}>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Shield className="h-5 w-5 text-blue-600" />
          Access Control
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Role baselines plus per-user overrides. Invite-only onboarding when open signup is off.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/admin/disposition-reasons" className={UI.secondaryButton + " py-1.5 text-xs"}>
            Disposition reasons →
          </Link>
          <Link
            href="/admin/audit"
            className={UI.secondaryButton + " inline-flex items-center gap-1 py-1.5 text-xs"}
          >
            <ScrollText className="h-3.5 w-3.5" />
            Audit log →
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Mail className="h-4 w-4 text-blue-600" />
          Invite user
        </h2>
        <p className="mt-1 text-xs text-slate-600">Creates a 24-hour link. User sets their own password.</p>
        <form onSubmit={sendInvite} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className={UI.label}>Email</label>
            <input
              type="email"
              className={UI.input}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="colleague@company.com"
            />
          </div>
          <div className="w-full sm:w-48">
            <label className={UI.label}>Role</label>
            <select
              className={UI.input}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={inviteBusy} className={UI.primaryButton}>
            {inviteBusy ? "Sending…" : "Create invite"}
          </button>
        </form>
        {inviteMessage ? <p className="mt-3 break-all text-xs text-slate-700">{inviteMessage}</p> : null}
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-sm text-slate-600">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[1100px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Role</th>
                {keys.map((k) => (
                  <th key={k} className="px-4 py-3">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-slate-900">{u.full_name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      value={u.role}
                      disabled={saving === u.id}
                      onChange={async (e) => {
                        const role = e.target.value;
                        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role } : x)));
                        await saveUser(u.id, { role });
                      }}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 max-w-[11rem]"
                    >
                      {roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  {keys.map((k) => (
                    <td key={`${u.id}-${k}`} className="px-4 py-3.5">
                      <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(u.permissions?.[k])}
                          disabled={saving === u.id || u.role === "admin"}
                          onChange={async (e) => {
                            const allowed = e.target.checked;
                            setUsers((prev) =>
                              prev.map((x) =>
                                x.id === u.id
                                  ? { ...x, permissions: { ...(x.permissions || {}), [k]: allowed } }
                                  : x
                              )
                            );
                            await saveUser(u.id, { permissions: { [k]: allowed } });
                          }}
                        />
                        Allow
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
