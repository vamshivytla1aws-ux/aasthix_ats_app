"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_CONFIG } from "@/lib/config";
import { apiFetchJson } from "@/lib/apiClient";
import {
  DASHBOARD_MORE_NAV,
  DASHBOARD_PRIMARY_NAV,
  isDashboardNavHrefActive,
  isNavItemVisible,
} from "@/lib/dashboardNavConfig";

type SidebarNavItem = {
  href: string;
  label: string;
  description?: string;
  permissionKey?: string;
  icon: (props: { className?: string }) => React.ReactNode;
};

const permKeyByHref: Record<string, string | undefined> = {};
for (const x of [...DASHBOARD_PRIMARY_NAV, ...DASHBOARD_MORE_NAV]) {
  permKeyByHref[x.href] = x.permissionKey;
}

function IconDashboard({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 13.5V20a1 1 0 0 0 1 1h5v-7.5H4Zm0-2h6V3H5a1 1 0 0 0-1 1v7.5Zm10 9.5h5a1 1 0 0 0 1-1v-5.5h-6V21Zm0-9.5h6V4a1 1 0 0 0-1-1h-5v8.5Z"
        className="fill-current"
        opacity="0.9"
      />
    </svg>
  );
}

function IconBriefcase({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M9 6a3 3 0 0 1 3-3h0a3 3 0 0 1 3 3v1h4a2 2 0 0 1 2 2v3.5a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a2 2 0 0 1 2-2h4V6Zm2 1h2V6a1 1 0 0 0-1-1h0a1 1 0 0 0-1 1v1Z"
        className="fill-current"
        opacity="0.9"
      />
      <path
        d="M3 14.5V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5A4.98 4.98 0 0 1 18 16H6a4.98 4.98 0 0 1-3-1.5Z"
        className="fill-current"
        opacity="0.65"
      />
    </svg>
  );
}

function IconUsers({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        className="fill-current"
        opacity="0.9"
      />
      <path
        d="M4 20a6 6 0 0 1 12 0v1H4v-1Z"
        className="fill-current"
        opacity="0.65"
      />
      <path
        d="M18.5 21v-1a7.98 7.98 0 0 0-2.17-5.52A5 5 0 0 1 21 19.5V21h-2.5Z"
        className="fill-current"
        opacity="0.5"
      />
    </svg>
  );
}

function IconKanban({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5Z"
        className="fill-current"
        opacity="0.9"
      />
      <path
        d="M14 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V5Z"
        className="fill-current"
        opacity="0.65"
      />
    </svg>
  );
}

function IconRoadmap({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 4h6v6H4V4Zm10 0h6v4h-6V4ZM4 14h6v6H4v-6Zm10 8V10h6v12h-6Z"
        className="fill-current"
        opacity="0.9"
      />
    </svg>
  );
}

function IconBuilding({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16H4Z"
        className="fill-current"
        opacity="0.9"
      />
      <path
        d="M15 10h3a2 2 0 0 1 2 2v9h-5V10Z"
        className="fill-current"
        opacity="0.65"
      />
      <path
        d="M7 7h2v2H7V7Zm0 4h2v2H7v-2Zm0 4h2v2H7v-2Zm4-8h2v2h-2V7Zm0 4h2v2h-2v-2Zm0 4h2v2h-2v-2Z"
        className="fill-white/70"
      />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M7 3a1 1 0 0 0-1 1v1H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3h-1V4a1 1 0 1 0-2 0v1H9V4A1 1 0 0 0 8 3H7Zm0 6h10a1 1 0 0 1 1 1v7H6v-7a1 1 0 0 1 1-1Z"
        className="fill-current"
        opacity="0.9"
      />
    </svg>
  );
}

function IconScreening({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 19V5a1 1 0 0 1 1-1h4l2 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z"
        className="fill-current"
        opacity="0.9"
      />
      <path d="M8 12h8M8 16h5" className="stroke-current" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function IconSparkles({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 2l1.2 4.2L17.5 7l-4.3 1L12 12l-1.2-4L6.5 7l4.3-1L12 2Zm7 9l.8 2.7 2.7.8-2.7.8-.8 2.7-.8-2.7-2.7-.8 2.7-.8.8-2.7ZM5 14l.9 3.1 3.1.9-3.1.9-.9 3.1-.9-3.1-3.1-.9 3.1-.9.9-3.1Z"
        className="fill-current"
        opacity="0.9"
      />
    </svg>
  );
}

const SIDEBAR_NAV: SidebarNavItem[] = [
  { href: "/dashboard", label: "Dashboard", description: "Metrics overview", icon: IconDashboard, permissionKey: permKeyByHref["/dashboard"] },
  { href: "/jobs", label: "Jobs", description: "Track roles", icon: IconBriefcase, permissionKey: permKeyByHref["/jobs"] },
  { href: "/recruiter/copilot", label: "Copilot", description: "Priorities & rediscovery", icon: IconSparkles, permissionKey: permKeyByHref["/recruiter/copilot"] },
  { href: "/clients", label: "Clients", description: "End customers & SPOCs", icon: IconBuilding, permissionKey: permKeyByHref["/clients"] },
  { href: "/candidates", label: "Candidates", description: "People database", icon: IconUsers, permissionKey: permKeyByHref["/candidates"] },
  { href: "/pipeline", label: "Pipeline", description: "Stages board", icon: IconKanban, permissionKey: permKeyByHref["/pipeline"] },
  { href: "/screening", label: "Screening", description: "AI test analytics", icon: IconScreening, permissionKey: permKeyByHref["/screening"] },
  { href: "/roadmap", label: "Roadmap", description: "Product initiatives", icon: IconRoadmap, permissionKey: permKeyByHref["/roadmap"] },
  { href: "/interviews", label: "Interviews", description: "Interview dashboard", icon: IconCalendar, permissionKey: permKeyByHref["/interviews"] },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const [role, setRole] = useState("user");
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    apiFetchJson<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me")
      .then((me) => {
        if (cancelled) return;
        setRole((me.user?.role || "user").toLowerCase());
        setPermissions(me.permissions || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleNav = useMemo(
    () => SIDEBAR_NAV.filter((item) => isNavItemVisible({ permissionKey: item.permissionKey }, role, permissions)),
    [role, permissions]
  );

  return (
    <aside className="hidden md:flex md:w-64 md:flex-col md:gap-6 md:border-r md:bg-white md:px-4 md:py-6">
      <div className="px-2 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white grid place-items-center text-[11px] font-extrabold tracking-wide shadow-sm ring-1 ring-blue-700/20">
          {APP_CONFIG.appName
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase())
            .join("")}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-slate-900 truncate">
            {APP_CONFIG.appName}
          </div>
          <div className="text-xs text-slate-500 truncate">{APP_CONFIG.tagline}</div>
        </div>
      </div>

      <div className="h-px bg-slate-200/70 mx-2" />

      <nav className="flex flex-col gap-3">
        {visibleNav.map((item) => (
          (() => {
            const active = isDashboardNavHrefActive(pathname, item.href);
            const Icon = item.icon;
            return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              "group relative rounded-xl px-3 py-3 transition-all duration-200",
              "hover:bg-gray-100",
              active ? "bg-blue-600 text-white shadow-sm" : "text-slate-900",
            ].join(" ")}
          >
            <span
              className={[
                "absolute left-0 top-2 bottom-2 w-1 rounded-r-full transition-colors",
                active ? "bg-white/80" : "bg-transparent",
              ].join(" ")}
              aria-hidden="true"
            />
            <div className="flex items-center gap-4">
              <span
                className={[
                  "h-11 w-11 rounded-2xl grid place-items-center shrink-0",
                  active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700 group-hover:bg-white",
                ].join(" ")}
              >
                <Icon className={["h-6 w-6", active ? "text-white" : "text-slate-700"].join(" ")} />
              </span>
              <div className="min-w-0">
                <div className={["text-sm font-semibold leading-5", active ? "text-white" : "text-slate-900"].join(" ")}>
                  {item.label}
                </div>
                {item.description && (
                  <div
                    className={[
                      "text-xs truncate",
                      active ? "text-white/80" : "text-slate-500 group-hover:text-slate-600",
                    ].join(" ")}
                  >
                    {item.description}
                  </div>
                )}
              </div>
            </div>
          </Link>
            );
          })()
        ))}
      </nav>

      <div className="mt-auto" />
      <div className="h-px bg-slate-200/70 mx-2" />

      <div className="px-3">
        <div className="rounded-xl bg-gray-50 p-3 text-xs text-slate-600">
          Tip: Use filters on Candidates and Pipeline to quickly find what you need.
        </div>
      </div>
    </aside>
  );
}
