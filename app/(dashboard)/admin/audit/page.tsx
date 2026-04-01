"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { apiFetchJson } from "@/lib/apiClient";
import { UI } from "@/lib/ui";

type Row = {
  id: number;
  actor_user_id: number | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

export default function AdminAuditPage() {
  const [events, setEvents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiFetchJson<{ events: Row[] }>("/api/admin/audit-events?limit=200");
        if (!cancelled) setEvents(data.events || []);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={["space-y-4", UI.pageShell].join(" ")}>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="inline-flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <ScrollText className="h-5 w-5 text-blue-600" />
          Security audit log
        </h1>
        <p className="mt-1 text-sm text-slate-600">Recent authentication and RBAC events.</p>
        <Link href="/admin/permissions" className={"mt-3 inline-block " + UI.secondaryButton + " py-1.5 text-xs"}>
          ← Access control
        </Link>
      </div>

      {error ? <div className="text-sm text-red-600">{error}</div> : null}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-slate-600">Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">
                    {new Date(ev.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{ev.action}</td>
                  <td className="px-4 py-2 text-xs">{ev.actor_user_id ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-slate-700 max-w-md truncate" title={JSON.stringify(ev.metadata)}>
                    {JSON.stringify(ev.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
