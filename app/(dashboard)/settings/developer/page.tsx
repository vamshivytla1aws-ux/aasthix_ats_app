"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Key, Plus, Trash2, Copy, CheckCircle2, ShieldAlert } from "lucide-react";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import { dashboardFetcher } from "@/lib/swrFetcher";

export default function DeveloperSettingsPage() {
  const { data, mutate } = useSWR<{ tokens: any[] }>("/api/settings/developer/tokens", dashboardFetcher);
  const [loading, setLoading] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const tokens = data?.tokens || [];

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/settings/developer/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTokenName }),
      });
      if (res.ok) {
        const json = await res.json();
        setGeneratedSecret(json.secret);
        setNewTokenName("");
        mutate();
      } else {
        alert("Failed to create token");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteToken = async (id: number) => {
    if (!confirm("Are you sure you want to revoke this token? Any integrations using it will immediately break.")) return;
    try {
      const res = await fetch(`/api/settings/developer/tokens?id=${id}`, { method: "DELETE" });
      if (res.ok) mutate();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = () => {
    if (generatedSecret) {
      navigator.clipboard.writeText(generatedSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <ModulePageFrame
      title="Developer Settings"
      subtitle="Manage Personal Access Tokens (PAT) for API integrations."
    >
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* Token Creation Section */}
        <section className="rounded-xl border border-[var(--ats-border)] bg-white p-6 shadow-sm dark:bg-slate-900">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Personal Access Tokens</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Generate tokens to authenticate with the ATS API. Tokens inherit your exact role permissions.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateToken} className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Token Name</label>
              <input
                type="text"
                placeholder="e.g., Zapier Integration, Python Script"
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                className="w-full rounded-lg border border-[var(--ats-border)] bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 dark:bg-slate-950 dark:focus:bg-slate-900"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading || !newTokenName.trim()}
              className="flex h-[42px] items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Generate new token
            </button>
          </form>

          {generatedSecret && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-900/20">
              <div className="mb-3 flex items-start gap-2 text-amber-800 dark:text-amber-200">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
                <div className="text-sm">
                  <span className="font-bold">Make sure to copy your personal access token now.</span>
                  <br />
                  You won’t be able to see it again!
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-white p-1 shadow-inner dark:border-amber-800 dark:bg-slate-950">
                <code className="flex-1 overflow-x-auto whitespace-nowrap px-3 text-sm font-mono text-slate-800 dark:text-slate-300">
                  {generatedSecret}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Tokens List Section */}
        <section className="rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-slate-900 overflow-hidden">
          <div className="border-b border-[var(--ats-border)] bg-slate-50 px-6 py-4 dark:bg-slate-900/50">
            <h3 className="font-semibold text-slate-900 dark:text-white">Active Tokens</h3>
          </div>
          <div className="divide-y divide-[var(--ats-border)]">
            {tokens.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                You haven't generated any access tokens yet.
              </div>
            ) : (
              tokens.map((token) => (
                <div key={token.id} className="flex items-center justify-between px-6 py-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">{token.name}</div>
                    <div className="mt-1 flex gap-4 text-xs text-slate-500">
                      <span>Created {new Date(token.created_at).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>
                        Last used {token.last_used_at ? new Date(token.last_used_at).toLocaleDateString() : "Never"}
                      </span>
                      {token.expires_at && (
                        <>
                          <span>•</span>
                          <span className={new Date(token.expires_at) < new Date() ? "text-rose-500 font-medium" : ""}>
                            Expires {new Date(token.expires_at).toLocaleDateString()}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteToken(token.id)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30"
                    title="Revoke Token"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </section>

      </div>
    </ModulePageFrame>
  );
}
