"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, Mail, ExternalLink, LayoutDashboard } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";

type MePayload = {
  user?: { role?: string; full_name?: string; email?: string };
  permissions?: Record<string, boolean>;
};

function humanizePermissionKey(key: string) {
  return key
    .split(".")
    .map((part) => part.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ");
}

export default function AccessGate({
  permissionKey,
  children,
}: {
  permissionKey: string;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const me = await apiFetchJson<MePayload>("/api/auth/me");
        const role = (me.user?.role || "user").toLowerCase();
        const ok = role === "admin" || me.permissions?.[permissionKey] !== false;
        if (!cancelled) setAllowed(ok);
      } catch {
        if (!cancelled) setAllowed(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [permissionKey]);

  if (loading) {
    return (
      <div className={`${UI.enterprise.elevatedCard} p-8 text-center text-sm text-slate-600 dark:text-slate-400`}>
        <div className="mx-auto mb-3 h-8 w-8 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" />
        Checking access…
      </div>
    );
  }

  if (!allowed) {
    const supportEmail = APP_CONFIG.supportEmail;
    const supportUrl = APP_CONFIG.supportRequestUrl;
    const permissionLabel = humanizePermissionKey(permissionKey);

    return (
      <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-white p-8 shadow-sm dark:border-amber-900/50 dark:from-amber-950/40 dark:to-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
            <ShieldAlert className="h-6 w-6" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-amber-950 dark:text-amber-100">You don&apos;t have access to this area</h1>
            <p className="mt-1 text-sm leading-relaxed text-amber-900/90 dark:text-amber-200/90">
              Your account is signed in, but this workspace requires the{" "}
              <span className="font-semibold text-amber-950 dark:text-amber-50">{permissionLabel}</span> permission (or an
              administrator role).
            </p>
            <p className="mt-3 text-xs text-amber-900/75 dark:text-amber-200/70">
              If you believe this is a mistake, contact your ATS administrator or IT help desk and reference the permission
              above.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-xl bg-amber-950 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-amber-900 dark:bg-amber-800 dark:hover:bg-amber-700"
              >
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Back to dashboard
              </Link>
              {supportUrl ? (
                <a
                  href={supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={UI.secondaryButton + " inline-flex items-center gap-2 py-2.5 text-xs"}
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Request access
                </a>
              ) : supportEmail ? (
                <a
                  href={`mailto:${supportEmail}?subject=${encodeURIComponent(`Access request: ${permissionKey}`)}&body=${encodeURIComponent(
                    `Hi,\n\nPlease grant me access to: ${permissionLabel} (${permissionKey}).\n\nThanks.`
                  )}`}
                  className={UI.secondaryButton + " inline-flex items-center gap-2 py-2.5 text-xs"}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Email support
                </a>
              ) : null}
            </div>
            {!supportUrl && !supportEmail ? (
              <p className="mt-4 text-[11px] text-amber-800/70 dark:text-amber-300/60">
                Tip: set <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[10px] dark:bg-amber-900/50">NEXT_PUBLIC_SUPPORT_EMAIL</code> or{" "}
                <code className="rounded bg-amber-100/80 px-1 py-0.5 font-mono text-[10px] dark:bg-amber-900/50">NEXT_PUBLIC_SUPPORT_REQUEST_URL</code> for a
                one-click request link.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
