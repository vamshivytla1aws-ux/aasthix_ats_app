"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";
import Toast from "@/components/Toast";
import { navigateAfterAuthSession } from "@/lib/postAuthRedirect";

export default function AcceptInvitePage() {
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const t = q.get("token");
    if (t) setToken(t);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), password, full_name: fullName }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Could not accept invite");
      void navigateAfterAuthSession();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={4000} />}
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Accept invitation</h1>
          <div className="text-sm text-slate-600">
            Join {APP_CONFIG.appName} using your invite link. Set your name and password.
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className={UI.label}>Invite token</label>
            <input
              className={UI.input}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              placeholder="Paste token from your invite link"
              autoComplete="off"
            />
          </div>
          <div>
            <label className={UI.label}>Full name</label>
            <input
              className={UI.input}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className={UI.label}>Password</label>
            <input
              type="password"
              className={UI.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="••••••••"
            />
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
          </div>
          <button type="submit" disabled={submitting} className={["w-full", UI.primaryButton].join(" ")}>
            {submitting ? "Creating account…" : "Activate account"}
          </button>
        </form>

        <div className="mt-6 text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-700 hover:underline">
            Sign in
          </Link>
        </div>
      </div>
    </>
  );
}
