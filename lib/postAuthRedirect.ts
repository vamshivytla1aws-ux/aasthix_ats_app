"use client";

import { resolveDefaultLandingPath } from "@/lib/defaultLandingPath";

/**
 * After login/signup cookie is set: honor `next` when safe, else role-aware default.
 */
export async function navigateAfterAuthSession(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    window.location.assign(next);
    return;
  }

  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) {
      window.location.assign("/dashboard");
      return;
    }
    const me = (await res.json()) as {
      user?: { role?: string };
      permissions?: Record<string, boolean>;
    };
    const role = (me.user?.role || "user").toLowerCase();
    const path = resolveDefaultLandingPath(role, me.permissions || {});
    window.location.assign(path);
  } catch {
    window.location.assign("/dashboard");
  }
}
