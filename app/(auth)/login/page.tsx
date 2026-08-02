"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import Toast from "@/components/Toast";
import { APP_CONFIG } from "@/lib/config";
import { navigateAfterAuthSession } from "@/lib/postAuthRedirect";
import { UI } from "@/lib/ui";

export default function LoginPage() {
  const [allowSignup, setAllowSignup] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const msg = new URLSearchParams(window.location.search).get("message");
    if (msg) setInfo(msg);
  }, []);

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then((d: { allowOpenSignup?: boolean }) => setAllowSignup(Boolean(d.allowOpenSignup)))
      .catch(() => setAllowSignup(false));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Login failed");
      }

      void navigateAfterAuthSession();
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {info && <Toast message={info} variant="success" onClose={() => setInfo(null)} autoHideMs={3500} />}
      {error && <Toast message={error} variant="error" onClose={() => setError(null)} autoHideMs={3500} />}

      <div className="w-full">
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--ats-primary)]">Welcome back</div>
            <h1 className="font-display text-3xl font-semibold text-[var(--ats-text)]">Sign in to your workspace</h1>
            <div className="text-sm leading-6 text-[var(--ats-text-muted)]">
              Sign in to {APP_CONFIG.appName}. {APP_CONFIG.tagline}
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
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
                placeholder="********"
              />
            </div>

            <button type="submit" disabled={submitting} className={["w-full", UI.primaryButton].join(" ")}>
              {submitting && (
                <span
                  className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  aria-hidden="true"
                />
              )}
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {allowSignup ? (
            <div className="text-xs leading-6 text-[var(--ats-text-muted)]">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-medium text-[var(--ats-primary)] hover:underline">
                Create one
              </Link>
              .
            </div>
          ) : (
            <div className="text-xs leading-6 text-[var(--ats-text-muted)]">
              Need access? Ask your administrator for an invite link, then open{" "}
              <Link href="/invite/accept" className="font-medium text-[var(--ats-primary)] hover:underline">
                Accept invitation
              </Link>
              .
            </div>
          )}
        </div>
      </div>
    </>
  );
}
