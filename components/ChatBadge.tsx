"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetchJson } from "@/lib/apiClient";
import { MessageSquare } from "lucide-react";
import { isNavItemVisible } from "@/lib/dashboardNavConfig";

export default function ChatBadge({ variant = "default" }: { variant?: "default" | "shell" }) {
  const [count, setCount] = useState(0);
  const [allowed, setAllowed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    apiFetchJson<{ user?: { role?: string }; permissions?: Record<string, boolean> }>("/api/auth/me")
      .then((me) => {
        if (cancelled) return;
        const role = (me.user?.role || "user").toLowerCase();
        setAllowed(isNavItemVisible({ permissionKey: "chat.view" }, role, me.permissions || {}));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    async function poll() {
      try {
        const data = await apiFetchJson<{ total_unread: number }>("/api/chat/unread");
        if (!cancelled) setCount(data.total_unread ?? 0);
      } catch {
        /* ignore — chat tables / permission */
      }
    }

    poll();
    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [allowed]);

  if (!allowed) return null;

  const cls =
    variant === "shell"
      ? "relative rounded-lg border border-white/30 bg-white/15 px-3 py-2 text-white transition hover:bg-white/25"
      : "relative rounded-xl border border-gray-200 bg-white px-3 py-2 text-slate-700 shadow-ats-sm transition duration-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700";

  return (
    <Link href="/chat" className={cls} title="Chat">
      <MessageSquare className="h-4 w-4" />
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-indigo-500 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white shadow-sm">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
