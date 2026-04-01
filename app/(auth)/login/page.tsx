"use client";

import Link from "next/link";
import React, { useState, useEffect } from "react";
import { APP_CONFIG } from "@/lib/config";
import { UI } from "@/lib/ui";
import Toast from "@/components/Toast";
import { navigateAfterAuthSession } from "@/lib/postAuthRedirect";

export default function LoginPage() {
  const [allowSignup, setAllowSignup] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const initialMessage =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("message")
      : null;
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(initialMessage);

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
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md hover:scale-[1.01]">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Login</h1>
        <div className="text-sm text-slate-600">
          Sign in to {APP_CONFIG.appName}. {APP_CONFIG.tagline}
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
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
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      {allowSignup ? (
        <div className="mt-6 text-xs text-slate-500">
          Don’t have an account?{" "}
          <Link href="/signup" className="text-blue-700 hover:underline">
            Create one
          </Link>
          .
        </div>
      ) : (
        <div className="mt-6 text-xs text-slate-500">
          Need access? Ask your administrator for an invite link, then open{" "}
          <Link href="/invite/accept" className="text-blue-700 hover:underline">
            Accept invitation
          </Link>
          .
        </div>
      )}
    </div>
    </>
  );
}

