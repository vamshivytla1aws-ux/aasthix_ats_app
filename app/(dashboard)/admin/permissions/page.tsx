"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, KeyRound, Shield, Mail, ScrollText } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import { INVITE_ROLES } from "@/lib/rbacConstants";
import { PERMISSION_CATALOG } from "@/lib/permissionCatalog";

type UserRow = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  permissions: Record<string, boolean>;
  access_scope: "own" | "team" | "all";
  is_active: boolean;
  permission_sources?: Record<string, "owner" | "override" | "role_template">;
};
type EmailHealth = { configuration: { provider_order: string[]; resend_configured: boolean; smtp_configured: boolean; sender: string | null; sender_domain_valid: boolean }; recent_events: Array<{ provider: string; status: string; error_category?: string; error_detail?: string; created_at: string }> };
type HrmsSchemaDiagnostics = {
  status: "healthy" | "warning";
  missing_tables: string[];
  missing_columns: string[];
  checked_at: string;
  recommended_migrations: string[];
};

export default function AdminPermissionsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>(["admin", "user"]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [hrmsDiagnostics, setHrmsDiagnostics] = useState<HrmsSchemaDiagnostics | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>(INVITE_ROLES[0] ?? "recruiter");
  const [inviteScope, setInviteScope] = useState<"own" | "team" | "all">("own");
  const [userSearch, setUserSearch] = useState("");
  const [advancedUserId, setAdvancedUserId] = useState<number | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [emailHealth, setEmailHealth] = useState<EmailHealth | null>(null);
  const [emailTestBusy, setEmailTestBusy] = useState(false);

  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ users: UserRow[]; permission_keys: string[]; roles?: string[] }>(
        "/api/admin/users-permissions"
      );
      try {
        const diagnostics = await apiFetchJson<{ diagnostics: HrmsSchemaDiagnostics }>("/api/hrms/diagnostics/schema");
        setHrmsDiagnostics(diagnostics.diagnostics || null);
      } catch {
        setHrmsDiagnostics(null);
      }
      setUsers(data.users || []);
      setKeys(data.permission_keys || []);
      if (Array.isArray(data.roles) && data.roles.length) setRoles(data.roles);
      const health = await apiFetchJson<EmailHealth>("/api/admin/email-health").catch(() => null);
      setEmailHealth(health);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load permissions";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function sendEmailTest() {
    setEmailTestBusy(true);
    setInviteMessage(null);
    try {
      const data = await apiFetchJson<{ result: { sent: boolean; provider?: string; detail?: string } }>("/api/admin/email-health", { method: "POST" });
      setInviteMessage(data.result.sent ? `Test email sent via ${data.result.provider}.` : data.result.detail || "Test email failed.");
      await load();
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : "Test email failed.");
    } finally {
      setEmailTestBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function saveUser(id: number, patch: { role?: string; permissions?: Record<string, boolean>; access_scope?: "own" | "team" | "all"; is_active?: boolean; revoke_sessions?: boolean }) {
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

  async function submitPasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!pwUser) return;
    setPwMessage(null);
    setError(null);
    if (pwNew.length < 8) {
      setPwMessage("Password must be at least 8 characters.");
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwMessage("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await apiFetchJson("/api/admin/users/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: pwUser.id, new_password: pwNew }),
      });
      setPwMessage(`Password updated for ${pwUser.email}.`);
      setPwNew("");
      setPwConfirm("");
      setPwUser(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to set password";
      setError(msg);
    } finally {
      setPwBusy(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteBusy(true);
    setInviteMessage(null);
    setError(null);
    try {
      const data = await apiFetchJson<{ inviteUrl?: string; delivery?: { sent?: boolean; provider?: string; detail?: string } }>("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, access_scope: inviteScope }),
      });
      setInviteMessage(data.delivery?.sent ? `Invitation email sent via ${data.delivery.provider || "configured provider"}.` : `Invite created, but email delivery needs attention. ${data.delivery?.detail || data.inviteUrl || ""}`);
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
          <Link href="/admin/call-health" className={UI.secondaryButton + " inline-flex items-center gap-1 py-1.5 text-xs"}><Activity className="h-3.5 w-3.5" />Call health</Link>
        </div>
      </div>

      {hrmsDiagnostics?.status === "warning" ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <div className="font-semibold">HRMS schema warning</div>
          <div className="mt-1 text-xs">
            Missing columns: {hrmsDiagnostics.missing_columns.join(", ") || "None"}
          </div>
          <div className="mt-1 text-xs">
            Missing tables: {hrmsDiagnostics.missing_tables.join(", ") || "None"}
          </div>
          {hrmsDiagnostics.recommended_migrations.length ? (
            <div className="mt-2 text-xs font-medium">
              Suggested migration: {hrmsDiagnostics.recommended_migrations.join(" | ")}
            </div>
          ) : null}
        </div>
      ) : null}

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
          <div className="w-full sm:w-48">
            <label className={UI.label}>Data scope</label>
            <select className={UI.input} value={inviteScope} onChange={(event) => setInviteScope(event.target.value as "own" | "team" | "all")}>
              <option value="own">Own records</option>
              <option value="team">Assigned / team</option>
              <option value="all">All records</option>
            </select>
          </div>
          <button type="submit" disabled={inviteBusy} className={UI.primaryButton}>
            {inviteBusy ? "Sending…" : "Create invite"}
          </button>
        </form>
        {inviteMessage ? <p className="mt-3 break-all text-xs text-slate-700">{inviteMessage}</p> : null}
      </div>

      <section className={UI.card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-semibold text-[var(--ats-text)]">Email health</h2><p className="text-sm text-[var(--ats-text-muted)]">Transactional invitations use the first healthy configured provider.</p></div>
          <button type="button" className={UI.secondaryButton} disabled={emailTestBusy} onClick={sendEmailTest}>{emailTestBusy ? "Sending test..." : "Send test to owner"}</button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-[var(--ats-border)] p-3 text-sm"><span className="block text-xs text-[var(--ats-text-muted)]">Provider order</span>{emailHealth?.configuration.provider_order.join(" -> ") || "Not available"}</div>
          <div className="rounded-xl border border-[var(--ats-border)] p-3 text-sm"><span className="block text-xs text-[var(--ats-text-muted)]">Resend sender</span>{emailHealth?.configuration.sender || "Not configured"}</div>
          <div className="rounded-xl border border-[var(--ats-border)] p-3 text-sm"><span className="block text-xs text-[var(--ats-text-muted)]">Last delivery</span>{emailHealth?.recent_events[0] ? `${emailHealth.recent_events[0].status} via ${emailHealth.recent_events[0].provider}` : "No delivery history"}</div>
        </div>
      </section>

      {pwUser ? (
        <div className="rounded-2xl border border-amber-200/90 bg-amber-50/50 p-5 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/20">
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            <KeyRound className="h-4 w-4 text-amber-700 dark:text-amber-400" />
            Set login password
          </h2>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            Writes a bcrypt hash to Postgres (<code className="rounded bg-white/60 px-1 dark:bg-slate-900/60">users.password_hash</code>
            ). User can sign in with this email and password immediately.
          </p>
          <form onSubmit={submitPasswordReset} className="mt-4 space-y-3">
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{pwUser.full_name}</div>
            <div className="text-xs text-slate-500">{pwUser.email}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={UI.label}>New password</label>
                <input
                  type="password"
                  className={UI.input}
                  autoComplete="new-password"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  required
                  minLength={8}
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className={UI.label}>Confirm</label>
                <input
                  type="password"
                  className={UI.input}
                  autoComplete="new-password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={pwBusy} className={UI.primaryButton}>
                {pwBusy ? "Saving…" : "Save password"}
              </button>
              <button
                type="button"
                className={UI.secondaryButton}
                onClick={() => {
                  setPwUser(null);
                  setPwNew("");
                  setPwConfirm("");
                  setPwMessage(null);
                }}
              >
                Cancel
              </button>
            </div>
            {pwMessage ? <p className="text-xs text-emerald-700 dark:text-emerald-400">{pwMessage}</p> : null}
          </form>
        </div>
      ) : null}

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      <section className={UI.card}>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-[var(--ats-text)]">Workspace users</h2><p className="text-sm text-[var(--ats-text-muted)]">Assign a role template and data scope. Use advanced access only for exceptions.</p></div><input className={`${UI.input} max-w-sm`} type="search" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} placeholder="Search name or email" /></div>
        {loading ? <div className="py-10 text-center text-sm text-[var(--ats-text-muted)]">Loading users...</div> : <div className="mt-4 space-y-3">{users.filter((user) => `${user.full_name} ${user.email}`.toLowerCase().includes(userSearch.toLowerCase())).map((u) => (
          <article key={u.id} className="rounded-[var(--ats-radius-lg)] border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto] lg:items-center"><div><div className="flex items-center gap-2"><span className="font-semibold text-[var(--ats-text)]">{u.full_name}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.is_active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{u.is_active ? "Active" : "Deactivated"}</span></div><div className="text-xs text-[var(--ats-text-muted)]">{u.email}</div></div>
              <div><label className={UI.label}>Role template</label><select className={UI.select} value={u.role} disabled={saving === u.id || u.role === "workspace_owner"} onChange={async (event) => { const role=event.target.value; setUsers((prev)=>prev.map((item)=>item.id===u.id?{...item,role}:item)); await saveUser(u.id,{role}); }}>{roles.filter((role)=>role!=="workspace_owner"||u.role==="workspace_owner").map((role)=><option key={role} value={role}>{role.replace(/_/g," ")}</option>)}</select></div>
              <div><label className={UI.label}>Data scope</label><select className={UI.select} value={u.access_scope || "own"} disabled={saving===u.id || u.role==="workspace_owner"} onChange={async(event)=>{const access_scope=event.target.value as "own"|"team"|"all";setUsers((prev)=>prev.map((item)=>item.id===u.id?{...item,access_scope}:item));await saveUser(u.id,{access_scope});}}><option value="own">Own records</option><option value="team">Assigned / team</option><option value="all">All records</option></select></div>
              <div className="flex flex-wrap gap-2"><button type="button" className={UI.secondaryButton} onClick={()=>setAdvancedUserId(advancedUserId===u.id?null:u.id)}>Advanced access</button><button type="button" className={UI.secondaryButton} onClick={()=>{setPwUser(u);setPwNew("");setPwConfirm("");}}>Password</button><button type="button" className={UI.secondaryButton} disabled={u.role==="workspace_owner"} onClick={async()=>{await saveUser(u.id,{is_active:!u.is_active});setUsers((prev)=>prev.map((item)=>item.id===u.id?{...item,is_active:!u.is_active}:item));}}>{u.is_active?"Deactivate":"Reactivate"}</button></div>
            </div>
            <div className="mt-3 rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-xs text-[var(--ats-text-muted)]"><strong className="text-[var(--ats-text)]">Effective access:</strong> {Object.values(u.permissions || {}).filter(Boolean).length} capabilities · {u.access_scope || "own"} data scope</div>
            {advancedUserId===u.id?<div className="mt-3 border-t border-[var(--ats-border)] pt-3"><div className="mb-3 flex items-center justify-between"><div><span className="text-sm font-semibold">Module and action access</span><p className="text-xs text-[var(--ats-text-muted)]">Each item shows its effective source: role template, explicit override, or owner.</p></div><button className={UI.secondaryButton} onClick={()=>void saveUser(u.id,{revoke_sessions:true})}>Revoke active sessions</button></div><div className="grid gap-3 lg:grid-cols-2">{PERMISSION_CATALOG.map((module)=><section key={module.id} className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-3"><div className="mb-2"><div className="text-sm font-semibold text-[var(--ats-text)]">{module.label}</div><div className="text-xs text-[var(--ats-text-muted)]">{module.description}</div></div><div className="space-y-1.5">{[...module.view,...module.manage,...(module.advanced||[])].map((key)=><label key={key} className="flex items-center justify-between gap-2 rounded-lg bg-[var(--ats-bg-panel)] px-2.5 py-2 text-xs"><span className="flex items-center gap-2"><input type="checkbox" checked={Boolean(u.permissions?.[key])} disabled={saving===u.id||u.role==="workspace_owner"} onChange={async(event)=>{const allowed=event.target.checked;setUsers((prev)=>prev.map((item)=>item.id===u.id?{...item,permissions:{...item.permissions,[key]:allowed},permission_sources:{...item.permission_sources,[key]:"override"}}:item));await saveUser(u.id,{permissions:{[key]:allowed}});}}/><span>{key.split(".").slice(1).join(" ").replace(/_/g," ")}</span></span><span className="rounded-full border border-[var(--ats-border)] px-2 py-0.5 text-[10px] text-[var(--ats-text-muted)]">{u.permission_sources?.[key]?.replace("_"," ") || "role template"}</span></label>)}</div></section>)}</div></div>:null}
          </article>
        ))}</div>}
      </section>
    </div>
  );
}
