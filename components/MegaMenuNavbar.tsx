"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, LogOut, Settings, Shield, User, Keyboard,
  HelpCircle, BarChart3, Bell, MessageSquare, Tag, StickyNote, PlusSquare,
} from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";
import AlertBell from "@/components/AlertBell";
import ChatBadge from "@/components/ChatBadge";
import DashboardThemeToggle from "@/components/DashboardThemeToggle";
import GlobalHeaderSearch from "@/components/GlobalHeaderSearch";
import AIUsageQuickPanel from "@/components/usage/AIUsageQuickPanel";
import {
  DASHBOARD_DOMAIN_NAV,
  DASHBOARD_MORE_NAV,
  DASHBOARD_PRIMARY_NAV,
  getDashboardDomainItemsForRole,
  getDomainForPath,
  isDashboardNavHrefActive,
  isNavItemVisible,
} from "@/lib/dashboardNavConfig";
import BrandLogo from "@/components/BrandLogo";
import { IA_V2_ENABLED } from "@/lib/featureFlags";

const ADMIN_LINKS = [
  { label: "Access control", href: "/admin/permissions" },
  { label: "Disposition reasons", href: "/admin/disposition-reasons" },
] as const;

export default function MegaMenuNavbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string>("user");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const moreRef = useRef<HTMLDivElement | null>(null);
  const quickRef = useRef<HTMLDivElement | null>(null);
  const profileRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetchJson<{ user: { full_name: string; email?: string; role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me")
      .then((data) => {
        if (!cancelled) {
          setUserName(data.user?.full_name || null);
          setUserEmail(data.user?.email || null);
          setRole((data.user?.role || "user").toLowerCase());
          setPermissions(data.permissions || {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!moreOpen && !profileOpen && !quickOpen) return;
    function onDoc(e: MouseEvent) {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
        setUsageOpen(false);
      }
      if (quickOpen && quickRef.current && !quickRef.current.contains(e.target as Node)) setQuickOpen(false);
      if (profileOpen && profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreOpen, quickOpen, profileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    setMobileOpen(false);
    setMoreOpen(false);
    setUsageOpen(false);
    setQuickOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  async function logout() {
    setLoading(true);
    try {
      await apiFetchJson("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    } finally {
      window.location.assign("/login?message=Session expired, please login again");
    }
  }

  const primaryVisible = useMemo(
    () => DASHBOARD_PRIMARY_NAV.filter((item) => isNavItemVisible(item, role, permissions)),
    [role, permissions]
  );
  const domainVisible = useMemo(
    () =>
      DASHBOARD_DOMAIN_NAV.filter((domain) => {
        if (domain.id === "admin" && permissions["access_control.manage"] !== true && permissions["settings.view"] !== true) return false;
        return true;
      }),
    [permissions]
  );
  const canAdministerWorkspace = permissions["access_control.manage"] === true;
  const canViewUsage = permissions["analytics.view"] === true;
  const domainMoreVisible = useMemo(() => {
    const activeDomain = getDomainForPath(pathname);
    return getDashboardDomainItemsForRole(activeDomain, role, permissions);
  }, [pathname, role, permissions]);
  const moreVisible = useMemo(
    () => DASHBOARD_MORE_NAV.filter((item) => isNavItemVisible(item, role, permissions)),
    [role, permissions]
  );
  const resolvedMoreVisible = useMemo(() => {
    if (!IA_V2_ENABLED) return moreVisible;
    const merged = new Map<string, (typeof moreVisible)[number]>();
    for (const item of [...domainMoreVisible, ...moreVisible]) merged.set(item.href, item);
    return Array.from(merged.values());
  }, [domainMoreVisible, moreVisible]);
  const canViewChat = useMemo(
    () => isNavItemVisible({ permissionKey: "chat.view" }, role, permissions),
    [role, permissions]
  );
  const canViewNotes = useMemo(
    () => isNavItemVisible({ permissionKey: "pipeline.view" }, role, permissions),
    [role, permissions]
  );
  const mobileNavItems = useMemo(() => {
    if (!IA_V2_ENABLED) return [...primaryVisible, ...moreVisible];
    const all = (["hiring", "delivery", "collaboration", "reporting", "workforce", "admin"] as const).flatMap((domain) =>
      getDashboardDomainItemsForRole(domain, role, permissions)
    );
    const dedupe = new Map<string, (typeof all)[number]>();
    for (const item of all) {
      dedupe.set(item.href, item);
    }
    return Array.from(dedupe.values());
  }, [primaryVisible, moreVisible, role, permissions]);

  return (
    <header className="sticky top-0 z-50">
      {/* Top shell â€” dark gradient */}
      <div className={`${UI.enterprise.shellGradient} border-b border-white/10 shadow-md shadow-slate-900/20`}>
        <div className="ats-page-inner flex flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link
            href="/dashboard"
            className="flex min-w-0 shrink-0 items-center gap-2.5 rounded-lg outline-none ring-offset-2 transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-white/50 sm:gap-3"
          >
            <BrandLogo
              size={36}
              className="shrink-0 rounded-lg bg-white/5 p-0.5 ring-1 ring-white/20"
              imageClassName="p-0.5"
            />
            <div className="min-w-0">
              <div className={`truncate text-sm font-semibold tracking-tight sm:text-base ${UI.enterprise.onShell}`}>
                {APP_CONFIG.appName}
              </div>
              <div className={`truncate text-[11px] sm:text-xs ${UI.enterprise.onShellMuted}`}>{APP_CONFIG.tagline}</div>
            </div>
          </Link>

          <GlobalHeaderSearch />

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="relative hidden md:block" ref={quickRef}>
              <button
                type="button"
                onClick={() => setQuickOpen((v) => !v)}
                className={UI.enterprise.shellGhostButton}
                aria-expanded={quickOpen}
              >
                <PlusSquare className="h-4 w-4" />
                Quick create
              </button>
              {quickOpen ? (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-2 shadow-[var(--ats-shadow-md)]">
                  {[
                    { href: "/jobs", label: "New job", hint: "Create a fresh job record" },
                    { href: "/candidates", label: "New candidate", hint: "Add or import talent" },
                    { href: "/pipeline", label: "Move pipeline", hint: "Update stage and ownership" },
                    { href: "/interviews", label: "Schedule interview", hint: "Open interview desk" },
                    { href: "/notes", label: "Open notes", hint: "Capture blockers and follow-ups" },
                    { href: "/chat", label: "Open chat", hint: "Collaborate with the team" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-xl px-3 py-2.5 transition hover:bg-[var(--ats-bg-panel-strong)]"
                      onClick={() => setQuickOpen(false)}
                    >
                      <div className="text-sm font-semibold text-[var(--ats-text)]">{item.label}</div>
                      <div className="text-xs text-[var(--ats-text-muted)]">{item.hint}</div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
            <DashboardThemeToggle variant="shell" />
            {userName ? (
              <>
                {canViewChat ? <ChatBadge variant="shell" /> : null}
                {canViewNotes ? (
                  <Link
                    href="/notes"
                    className="relative rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-white transition hover:bg-white/25"
                    title="Team notes"
                    aria-label="Team notes"
                  >
                    <StickyNote className="h-4 w-4" />
                  </Link>
                ) : null}
                <AlertBell variant="shell" />

                {/* Profile dropdown */}
                <div className="relative hidden sm:block" ref={profileRef}>
                  <button
                    type="button"
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-lg border border-white/30 bg-white/15 px-2.5 py-1.5 text-white transition hover:bg-white/25"
                    aria-expanded={profileOpen}
                    aria-haspopup="true"
                  >
                    <div className="grid h-7 w-7 place-items-center rounded-md bg-white/30 text-[10px] font-bold text-white">
                      {userName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                    </div>
                    <span className="max-w-[100px] truncate text-xs font-semibold text-white md:max-w-[140px]">
                      {userName}
                    </span>
                    <ChevronDown className={`h-3 w-3 text-white/70 transition ${profileOpen ? "rotate-180" : ""}`} />
                  </button>

                  {profileOpen && (
                    <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      {/* User info header */}
                      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                            {userName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{userName}</div>
                            {userEmail && <div className="truncate text-xs text-slate-500">{userEmail}</div>}
                            <span className="mt-0.5 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              {role === "workspace_owner" ? "Workspace Owner" : role === "admin" ? "Administrator" : "Team Member"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Settings â€” always visible, top of menu */}
                      <div className="border-b border-slate-100 py-1 dark:border-slate-700">
                        <ProfileMenuItem
                          icon={<Settings className="h-4 w-4" />}
                          label="Settings"
                          href="/settings"
                          onClick={() => setProfileOpen(false)}
                        />
                        <ProfileMenuItem
                          icon={<User className="h-4 w-4" />}
                          label="My Profile"
                          href="/settings#profile"
                          onClick={() => setProfileOpen(false)}
                        />
                      </div>

                      {/* Navigation shortcuts */}
                      <div className="border-b border-slate-100 py-1 dark:border-slate-700">
                        <ProfileMenuItem
                          icon={<BarChart3 className="h-4 w-4" />}
                          label="Analytics"
                          href="/analytics"
                          onClick={() => setProfileOpen(false)}
                        />
                        {canViewChat ? (
                          <ProfileMenuItem
                            icon={<MessageSquare className="h-4 w-4" />}
                            label="Chat"
                            href="/chat"
                            onClick={() => setProfileOpen(false)}
                          />
                        ) : null}
                        {canViewNotes ? (
                          <ProfileMenuItem
                            icon={<StickyNote className="h-4 w-4" />}
                            label="Notes"
                            href="/notes"
                            onClick={() => setProfileOpen(false)}
                          />
                        ) : null}
                        <ProfileMenuItem
                          icon={<Bell className="h-4 w-4" />}
                          label="Alerts"
                          href="/alerts"
                          onClick={() => setProfileOpen(false)}
                        />
                      </div>

                      {/* Admin section */}
                      {canAdministerWorkspace && (
                        <div className="border-b border-slate-100 py-1 dark:border-slate-700">
                          <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Admin</div>
                          <ProfileMenuItem
                            icon={<Shield className="h-4 w-4" />}
                            label="Access Control"
                            href="/admin/permissions"
                            onClick={() => setProfileOpen(false)}
                          />
                          <ProfileMenuItem
                            icon={<Tag className="h-4 w-4" />}
                            label="Disposition Reasons"
                            href="/admin/disposition-reasons"
                            onClick={() => setProfileOpen(false)}
                          />
                        </div>
                      )}

                      {/* Help & info */}
                      <div className="border-b border-slate-100 py-1 dark:border-slate-700">
                        <ProfileMenuItem
                          icon={<Keyboard className="h-4 w-4" />}
                          label="Keyboard Shortcuts"
                          onClick={() => { setProfileOpen(false); showShortcutsToast(); }}
                        />
                        <ProfileMenuItem
                          icon={<HelpCircle className="h-4 w-4" />}
                          label="Help & Support"
                          href="/roadmap"
                          onClick={() => setProfileOpen(false)}
                        />
                      </div>

                      {/* Logout */}
                      <div className="p-2">
                        <button
                          type="button"
                          onClick={() => { setProfileOpen(false); void logout(); }}
                          disabled={loading}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          <LogOut className="h-4 w-4" />
                          {loading ? "Signing outâ€¦" : "Sign Out"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : null}
            <button
              type="button"
              className={`${UI.enterprise.shellIconButton} lg:hidden`}
              aria-expanded={mobileOpen}
              aria-label="Open menu"
              onClick={() => setMobileOpen((v) => !v)}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Secondary navigation â€” compact horizontal */}
      <nav
        className={`${UI.enterprise.secondaryNavBar} hidden lg:block`}
        aria-label="Workspace modules"
      >
        <div className="ats-page-inner flex min-h-[2.75rem] flex-wrap items-center gap-1.5 px-4 py-2 sm:px-6">
          {!IA_V2_ENABLED
            ? primaryVisible.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className={[
                    UI.enterprise.secondaryNavLink,
                    isDashboardNavHrefActive(pathname, item.href) ? UI.enterprise.secondaryNavLinkActive : "",
                  ].join(" ")}
                >
                  {item.label}
                </Link>
              ))
            : null}
          {IA_V2_ENABLED
            ? domainVisible.map((domain) => (
                <Link
                  key={domain.id}
                  href={domain.href}
                  className={[
                    UI.enterprise.secondaryNavLink,
                    getDomainForPath(pathname) === domain.id ? UI.enterprise.secondaryNavLinkActive : "",
                  ].join(" ")}
                >
                  {domain.label}
                </Link>
              ))
            : null}

          <div className="relative pl-1" ref={moreRef}>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className={[
                UI.enterprise.secondaryNavLink,
                "inline-flex items-center gap-0.5",
                moreOpen ? UI.enterprise.secondaryNavLinkActive : "",
              ].join(" ")}
              aria-expanded={moreOpen}
            >
              More
              <ChevronDown className={`h-3.5 w-3.5 transition ${moreOpen ? "rotate-180" : ""}`} />
            </button>
            {moreOpen ? (
              <div className="absolute left-0 top-full z-50 mt-1 min-w-[280px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-900">
                {canViewUsage ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setUsageOpen((value) => !value)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-slate-800 transition hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="inline-flex items-center gap-2">
                        <BarChart3 className="h-3.5 w-3.5" />
                        AI Usage
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 transition ${usageOpen ? "rotate-180" : ""}`} />
                    </button>
                    {usageOpen ? <AIUsageQuickPanel /> : null}
                  </>
                ) : null}
                {resolvedMoreVisible.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    onClick={() => {
                      setMoreOpen(false);
                      setUsageOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                ))}
                {canAdministerWorkspace ? (
                  <>
                    <Link
                      href="/usage"
                      className="block border-t border-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      onClick={() => {
                        setMoreOpen(false);
                        setUsageOpen(false);
                      }}
                    >
                      AI Usage dashboard
                    </Link>
                    {ADMIN_LINKS.map((al) => (
                      <Link
                        key={al.href}
                        href={al.href}
                        className="block border-t border-slate-100 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        onClick={() => {
                          setMoreOpen(false);
                          setUsageOpen(false);
                        }}
                      >
                        {al.label}
                      </Link>
                    ))}
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, x: "100%" }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="fixed inset-y-0 right-0 z-50 flex w-[min(100vw,22rem)] flex-col overflow-y-auto border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 lg:hidden"
            >
              <div className="border-b border-slate-100 p-4 dark:border-slate-700">
                {userName ? (
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                      {userName.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">{userName}</div>
                      {userEmail && <div className="truncate text-xs text-slate-500">{userEmail}</div>}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">Navigate</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{APP_CONFIG.appName}</p>
                  </div>
                )}
              </div>
              <div className="border-b border-slate-100 p-3 dark:border-slate-700">
                <GlobalHeaderSearch variant="panel" />
              </div>
              <nav className="flex-1 space-y-1 p-3">
                {mobileNavItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
                {canViewUsage ? (
                  <Link
                    href="/usage"
                    className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                    onClick={() => setMobileOpen(false)}
                  >
                    AI Usage
                  </Link>
                ) : null}
                {canAdministerWorkspace
                  ? ADMIN_LINKS.map((al) => (
                      <Link
                        key={al.href}
                        href={al.href}
                        className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                        onClick={() => setMobileOpen(false)}
                      >
                        {al.label}
                      </Link>
                    ))
                  : null}
              </nav>
              <div className="mobile-safe-bottom border-t border-slate-100 p-4 dark:border-slate-700 sm:pb-4">
                <form method="POST" action="/api/auth/logout">
                  <input type="hidden" name="redirect_to" value="/login?message=Logged out" />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/*  Profile menu item                                                  */
/* ------------------------------------------------------------------ */

function ProfileMenuItem({
  icon, label, href, onClick,
}: {
  icon: React.ReactNode; label: string; href?: string; onClick?: () => void;
}) {
  const cls = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800";

  if (href) {
    return (
      <Link href={href} className={cls} onClick={onClick}>
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        {label}
      </Link>
    );
  }

  return (
    <button type="button" className={cls} onClick={onClick}>
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      {label}
    </button>
  );
}

function showShortcutsToast() {
  const el = document.createElement("div");
  el.className = "fixed bottom-6 right-6 z-[9999] max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in slide-in-from-bottom-4";
  el.innerHTML = `
    <div class="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Keyboard Shortcuts</div>
    <div class="space-y-1 text-xs text-slate-600 dark:text-slate-400">
      <div class="flex justify-between"><span>Global Search</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">/</kbd></div>
      <div class="flex justify-between"><span>Navigate Home</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">G H</kbd></div>
      <div class="flex justify-between"><span>Go to Jobs</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">G J</kbd></div>
      <div class="flex justify-between"><span>Go to Candidates</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">G C</kbd></div>
      <div class="flex justify-between"><span>Go to Pipeline</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">G P</kbd></div>
      <div class="flex justify-between"><span>Go to Chat</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">G M</kbd></div>
      <div class="flex justify-between"><span>Close / Dismiss</span><kbd class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">Esc</kbd></div>
    </div>
  `;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity 300ms"; }, 5000);
  setTimeout(() => el.remove(), 5400);
}

