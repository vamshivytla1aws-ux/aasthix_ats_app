"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetchJson } from "@/lib/apiClient";
import { APP_CONFIG } from "@/lib/config";

export default function TopNav() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);

  const pageTitle = useMemo(() => {
    if (pathname === "/jobs" || pathname.startsWith("/jobs/")) return "Jobs";
    if (pathname === "/dashboard") return "Dashboard";
    if (pathname === "/candidates") return "Candidates";
    if (pathname === "/pipeline") return "Pipeline";
    if (pathname === "/roadmap") return "Roadmap";
    return APP_CONFIG.appName;
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    apiFetchJson<{ user: { full_name: string } }>("/api/auth/me")
      .then((data) => {
        if (!cancelled) setUserName(data.user?.full_name || null);
      })
      .catch(() => {
        // ignore; apiFetchJson will handle 401 globally
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    setLoading(true);
    try {
      await apiFetchJson("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore errors; still proceed to login
    } finally {
      window.location.assign("/login?message=Session expired, please login again");
    }
  }

  return (
    <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200/70 bg-white/85 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {APP_CONFIG.appName}
          </div>
          <div className="text-base font-semibold text-slate-900 truncate">{pageTitle}</div>
        </div>
        <div className="flex items-center gap-3">
          {userName && (
            <div className="hidden sm:flex items-center gap-2 rounded-2xl bg-gray-100 px-3 py-2">
              <div className="h-8 w-8 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white grid place-items-center text-[10px] font-extrabold">
                {userName
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((p) => p[0]?.toUpperCase())
                  .join("")}
              </div>
              <div className="text-sm font-semibold text-slate-800 max-w-[180px] truncate">
                {userName}
              </div>
            </div>
          )}
        <button
          onClick={logout}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-all duration-200 hover:bg-gray-50 hover:shadow-md hover:scale-[1.01] disabled:opacity-50"
        >
          {loading && (
            <span
              className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 animate-spin"
              aria-hidden="true"
            />
          )}
          {loading ? "Logging out..." : "Logout"}
        </button>
        </div>
      </div>
    </div>
  );
}
