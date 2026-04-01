"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";
import Toast from "@/components/Toast";
import { navigateAfterAuthSession } from "@/lib/postAuthRedirect";

export default function SignupPage() {
  const [allowSignup, setAllowSignup] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d: { allowOpenSignup?: boolean }) => setAllowSignup(Boolean(d.allowOpenSignup)))
      .catch(() => setAllowSignup(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: fullName, email, password }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Signup failed");
      }
      void navigateAfterAuthSession();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setToast({ message: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (allowSignup === null) {
    return (
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm text-sm text-slate-600">Loading…</div>
    );
  }

  if (!allowSignup) {
    return (
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Create account</h1>
        <p className="mt-2 text-sm text-slate-600">
          Self-service registration is disabled for {APP_CONFIG.appName}. Ask an administrator for an invitation link.
        </p>
        <p className="mt-4 text-sm">
          <Link href="/invite/accept" className="text-blue-700 hover:underline">
            I have an invite link
          </Link>
          {" · "}
          <Link href="/login" className="text-blue-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={3500} />}
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Create account</h1>
          <div className="text-sm text-slate-600">
            Create an account for {APP_CONFIG.appName}. {APP_CONFIG.tagline}
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
            <label className={UI.label}>Email</label>
            <input
              type="email"
              className={UI.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
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
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className={["w-full", UI.primaryButton].join(" ")}
          >
            {submitting && (
              <span
                className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin"
                aria-hidden="true"
              />
            )}
            {submitting ? "Creating..." : "Create account"}
          </button>
        </form>

        <div className="mt-6 text-xs text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-700 hover:underline">
            Sign in
          </Link>
          .
        </div>
      </div>
    </>
  );
}
