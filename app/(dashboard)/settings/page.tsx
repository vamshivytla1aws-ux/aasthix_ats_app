"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import {
  Settings, User, Bell, Palette, LayoutGrid, Monitor,
  Shield, Save, CheckCircle2, Info, Clock, KeyRound, Calendar,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type UserProfile = {
  id: number;
  full_name: string;
  email: string;
  role: string;
  created_at?: string;
};

type NotificationPrefs = {
  email_alerts: boolean;
  browser_notifications: boolean;
  chat_sounds: boolean;
  daily_digest: boolean;
};

const NOTIF_STORAGE_KEY = "ats-notification-prefs";
const DENSITY_STORAGE_KEY = "ats-settings-density";

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "appearance" | "notifications" | "calendar" | "session">("profile");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetchJson<{ user: UserProfile; permissions?: Record<string, boolean> }>("/api/auth/me")
      .then((d) => { setUser(d.user); setPermissions(d.permissions || {}); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const TABS = [
    { id: "profile" as const, label: "Profile", icon: <User className="h-4 w-4" /> },
    { id: "appearance" as const, label: "Appearance", icon: <Palette className="h-4 w-4" /> },
    { id: "notifications" as const, label: "Notifications", icon: <Bell className="h-4 w-4" /> },
    ...(permissions["settings.manage"] === true
      ? [{ id: "calendar" as const, label: "Calendar & Meet", icon: <Calendar className="h-4 w-4" /> }]
      : []),
    { id: "session" as const, label: "Session & Security", icon: <KeyRound className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Settings</h1>
          <p className="text-xs text-slate-500">Manage your profile, preferences, and notifications</p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar tabs */}
        <div className="w-48 shrink-0 space-y-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                "flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-medium transition",
                tab === t.id
                  ? "bg-indigo-50 text-indigo-700 shadow-sm dark:bg-indigo-950/40 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
              ].join(" ")}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
              <div className="h-5 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mt-4 h-4 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          ) : (
            <>
              {tab === "profile" && <ProfileSection user={user} />}
              {tab === "appearance" && <AppearanceSection />}
              {tab === "notifications" && <NotificationsSection />}
              {tab === "calendar" && <CalendarMeetSection user={user} />}
              {tab === "session" && <SessionSection user={user} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  PROFILE                                                            */
/* ================================================================== */

function ProfileSection({ user }: { user: UserProfile | null }) {
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (user?.full_name) setFullName(user.full_name); }, [user]);

  const handleSave = useCallback(async () => {
    if (!fullName.trim() || saving) return;
    setSaving(true);
    try {
      await apiFetchJson("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName.trim() }),
      });
      setToast("Profile updated");
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast("Failed to update profile");
      setTimeout(() => setToast(null), 3000);
    } finally {
      setSaving(false);
    }
  }, [fullName, saving]);

  return (
    <SettingsCard title="Profile" subtitle="Your personal information" icon={<User className="h-5 w-5" />}>
      {toast && <Toast message={toast} />}

      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-indigo-600 text-xl font-bold text-white">
            {(user?.full_name ?? "U").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
          </div>
          <div>
            <div className="text-base font-semibold text-slate-900 dark:text-slate-100">{user?.full_name}</div>
            <div className="text-sm text-slate-500">{user?.email}</div>
            <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {user?.role === "admin" ? "Administrator" : "Team Member"}
            </span>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        <div>
          <label className={UI.label}>Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={UI.input}
          />
        </div>

        <div>
          <label className={UI.label}>Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className={UI.input + " cursor-not-allowed opacity-60"}
          />
          <p className="mt-1 text-xs text-slate-400">Email cannot be changed. Contact an administrator.</p>
        </div>

        <div>
          <label className={UI.label}>Role</label>
          <input
            type="text"
            value={user?.role === "admin" ? "Administrator" : "Team Member"}
            disabled
            className={UI.input + " cursor-not-allowed opacity-60"}
          />
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || fullName.trim() === user?.full_name}
            className={UI.primaryButton + " text-sm"}
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </SettingsCard>
  );
}

/* ================================================================== */
/*  APPEARANCE                                                         */
/* ================================================================== */

function AppearanceSection() {
  const [density, setDensity] = useState<"comfortable" | "compact" | "ultra">("compact");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (saved === "comfortable" || saved === "compact" || saved === "ultra") setDensity(saved);
    } catch { /* ignore */ }
  }, []);

  function updateDensity(d: "comfortable" | "compact" | "ultra") {
    setDensity(d);
    try { localStorage.setItem(DENSITY_STORAGE_KEY, d); } catch { /* ignore */ }
  }

  const densities: Array<{ value: "comfortable" | "compact" | "ultra"; label: string; desc: string }> = [
    { value: "comfortable", label: "Comfortable", desc: "More spacing, larger text" },
    { value: "compact", label: "Compact", desc: "Default, balanced density" },
    { value: "ultra", label: "Ultra Compact", desc: "Maximum data density" },
  ];

  return (
    <SettingsCard title="Appearance" subtitle="Customize look and feel" icon={<Palette className="h-5 w-5" />}>
      <div className="space-y-6">
        {/* Theme */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Theme</h4>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            Light mode is enforced across the ATS. Auto and dark themes are disabled.
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* Density */}
        <div>
          <h4 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Table Density</h4>
          <div className="space-y-2">
            {densities.map((d) => (
              <label
                key={d.value}
                className={[
                  "flex cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 transition",
                  density === d.value
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
                    : "border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="density"
                  checked={density === d.value}
                  onChange={() => updateDensity(d.value)}
                  className="h-4 w-4 accent-indigo-600"
                />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{d.label}</div>
                  <div className="text-xs text-slate-500">{d.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

/* ================================================================== */
/*  NOTIFICATIONS                                                      */
/* ================================================================== */

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    email_alerts: true,
    browser_notifications: true,
    chat_sounds: true,
    daily_digest: false,
  });
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NOTIF_STORAGE_KEY);
      if (raw) setPrefs(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  function toggle(key: keyof NotificationPrefs) {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem(NOTIF_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setToast("Preference saved");
    setTimeout(() => setToast(null), 2000);
  }

  const items: Array<{ key: keyof NotificationPrefs; label: string; desc: string; icon: React.ReactNode }> = [
    { key: "email_alerts", label: "Email Alerts", desc: "Receive email notifications for interview reminders and SLA alerts", icon: <Bell className="h-4 w-4" /> },
    { key: "browser_notifications", label: "Browser Notifications", desc: "Show desktop notifications for new messages and alerts", icon: <Monitor className="h-4 w-4" /> },
    { key: "chat_sounds", label: "Chat Sounds", desc: "Play a sound when you receive a new chat message", icon: <LayoutGrid className="h-4 w-4" /> },
    { key: "daily_digest", label: "Daily Digest", desc: "Receive a daily summary of your pending tasks and pipeline", icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <SettingsCard title="Notifications" subtitle="Control how you receive updates" icon={<Bell className="h-5 w-5" />}>
      {toast && <Toast message={toast} />}
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.key}
            className="flex items-center justify-between rounded-xl px-4 py-3.5 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <div className="flex items-center gap-3">
              <span className="text-slate-400">{item.icon}</span>
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</div>
                <div className="text-xs text-slate-500">{item.desc}</div>
              </div>
            </div>
            <ToggleSwitch checked={prefs[item.key]} onChange={() => toggle(item.key)} />
          </div>
        ))}
      </div>
    </SettingsCard>
  );
}

function CalendarMeetSection({ user }: { user: UserProfile | null }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    provider_env_ready?: { google?: boolean };
    shared_google?: {
      connected: boolean;
      configured: boolean;
      account_email: string | null;
      account_name: string | null;
      calendar_id: string | null;
      updated_at: string | null;
      sync_error: string | null;
    };
  } | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<typeof status>("/api/settings/calendar");
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load Google Calendar status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const state = url.searchParams.get("calendar");
    if (!state) return;
    const map: Record<string, string> = {
      connected: "Shared Google Calendar connected.",
      connect_failed: "Google Calendar connection failed.",
      forbidden: "Workspace settings access is required to connect the shared Google account.",
      unauthorized: "Please sign in again to complete Google Calendar connection.",
      invalid_auth_state: "Google OAuth state check failed. Please try again.",
      missing_auth_state: "Google OAuth could not be completed. Please try again.",
    };
    setToast(map[state] || `Calendar status: ${state}`);
    url.searchParams.delete("calendar");
    window.history.replaceState({}, "", url.toString());
  }, []);

  async function connectGoogle() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetchJson<{ authUrl: string }>("/api/settings/calendar/google/connect", {
        method: "POST",
      });
      window.location.assign(res.authUrl);
    } catch (err: any) {
      setError(err?.message || "Failed to start Google Calendar connection");
      setBusy(false);
    }
  }

  async function disconnectGoogle() {
    setBusy(true);
    setError(null);
    try {
      await apiFetchJson("/api/settings/calendar/google/disconnect", { method: "POST" });
      setToast("Shared Google Calendar disconnected.");
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || "Failed to disconnect Google Calendar");
    } finally {
      setBusy(false);
    }
  }

  async function testGoogle() {
    setTestBusy(true);
    setError(null);
    try {
      const result = await apiFetchJson<{ health?: { ok?: boolean; account_email?: string | null } }>("/api/settings/calendar/test", { method: "POST" });
      setToast(result.health?.ok ? `Google Calendar is healthy${result.health.account_email ? ` for ${result.health.account_email}` : ""}.` : "Google Calendar test completed with warnings.");
      await loadStatus();
    } catch (err: any) {
      setError(err?.message || "Google Calendar health test failed");
    } finally {
      setTestBusy(false);
    }
  }

  const shared = status?.shared_google;
  const googleReady = Boolean(status?.provider_env_ready?.google);

  return (
    <SettingsCard
      title="Calendar & Meet"
      subtitle="Connect a shared company Google account to auto-create Meet invites for interviews."
      icon={<Calendar className="h-5 w-5" />}
    >
      {toast && <Toast message={toast} />}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-slate-500">Loading calendar status…</div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Shared Google account</div>
                <div className="mt-1 text-xs text-slate-500">
                  This account will own Google Meet links and send calendar invites to candidates and internal panel attendees.
                </div>
              </div>
              <span
                className={[
                  "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                  shared?.connected
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                    : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
                ].join(" ")}
              >
                {shared?.connected ? "Connected" : "Not connected"}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-xs text-slate-600 dark:text-slate-300 md:grid-cols-2">
              <div>Environment ready: {googleReady ? "Yes" : "No"}</div>
              <div>Account: {shared?.account_email || "—"}</div>
              <div>Calendar: {shared?.calendar_id || "primary"}</div>
              <div>Updated: {shared?.updated_at ? new Date(shared.updated_at).toLocaleString() : "—"}</div>
            </div>
            {shared?.sync_error ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Last sync issue: {shared.sync_error}
              </div>
            ) : null}
          </div>

          {!googleReady ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required on the server before Google Meet can be connected.
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Signed in as {user?.full_name || "Admin"}.
            </div>
            <div className="flex gap-2">
              {shared?.connected ? (
                <button type="button" onClick={() => void testGoogle()} disabled={busy || testBusy} className={UI.secondaryButton + " text-xs py-2"}>
                  {testBusy ? "Testing..." : "Test connection"}
                </button>
              ) : null}
              {shared?.connected ? (
                <button type="button" onClick={() => void disconnectGoogle()} disabled={busy} className={UI.secondaryButton + " text-xs py-2"}>
                  {busy ? "Disconnecting…" : "Disconnect"}
                </button>
              ) : null}
              <button type="button" onClick={() => void connectGoogle()} disabled={busy || !googleReady} className={UI.primaryButton + " text-xs py-2"}>
                {busy ? "Opening Google…" : shared?.connected ? "Reconnect Google" : "Connect Google"}
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

/* ================================================================== */
/*  SESSION & SECURITY                                                 */
/* ================================================================== */

function SessionSection({ user }: { user: UserProfile | null }) {
  const [changingPw, setChangingPw] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleChangePassword() {
    if (!currentPw || !newPw || newPw !== confirmPw) {
      setToast("Passwords don't match");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    if (newPw.length < 6) {
      setToast("Password must be at least 6 characters");
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSaving(true);
    try {
      await apiFetchJson("/api/settings/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPw, new_password: newPw }),
      });
      setToast("Password updated successfully");
      setChangingPw(false);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      setToast(msg);
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  return (
    <SettingsCard title="Session & Security" subtitle="Manage your session and password" icon={<KeyRound className="h-5 w-5" />}>
      {toast && <Toast message={toast} />}

      <div className="space-y-5">
        {/* Session info */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
            <Info className="h-4 w-4 text-indigo-500" />
            Session Information
          </div>
          <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs text-slate-600 dark:text-slate-400">
            <span>User ID</span>
            <span className="font-mono text-slate-900 dark:text-slate-200">{user?.id ?? "—"}</span>
            <span>Email</span>
            <span className="text-slate-900 dark:text-slate-200">{user?.email ?? "—"}</span>
            <span>Role</span>
            <span className="text-slate-900 dark:text-slate-200">{user?.role === "admin" ? "Administrator" : "Team Member"}</span>
            <span>Member since</span>
            <span className="text-slate-900 dark:text-slate-200">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
            </span>
          </div>
        </div>

        <hr className="border-slate-100 dark:border-slate-800" />

        {/* Change password */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Password</h4>
              <p className="text-xs text-slate-500">Change your login password</p>
            </div>
            {!changingPw && (
              <button
                type="button"
                onClick={() => setChangingPw(true)}
                className={UI.secondaryButton + " text-xs py-2"}
              >
                Change Password
              </button>
            )}
          </div>

          {changingPw && (
            <div className="mt-4 space-y-3">
              <div>
                <label className={UI.label}>Current Password</label>
                <input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={UI.input} />
              </div>
              <div>
                <label className={UI.label}>New Password</label>
                <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={UI.input} />
              </div>
              <div>
                <label className={UI.label}>Confirm New Password</label>
                <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={UI.input} />
                {newPw && confirmPw && newPw !== confirmPw && (
                  <p className="mt-1 text-xs text-red-500">Passwords don&apos;t match</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => { setChangingPw(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }} className={UI.secondaryButton + " text-xs py-2"}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleChangePassword()}
                  disabled={saving || !currentPw || !newPw || newPw !== confirmPw}
                  className={UI.primaryButton + " text-xs py-2"}
                >
                  {saving ? "Saving…" : "Update Password"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </SettingsCard>
  );
}

/* ================================================================== */
/*  SHARED COMPONENTS                                                  */
/* ================================================================== */

function SettingsCard({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{title}</h3>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={[
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
        checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600",
      ].join(" ")}
    >
      <span
        className={[
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}
