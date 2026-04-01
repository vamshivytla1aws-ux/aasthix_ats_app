"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { apiFetchJson, ApiError } from "@/lib/apiClient";
import { UI } from "@/lib/ui";
import ClientModal, { ClientRow } from "@/components/ClientModal";
import AccessGate from "@/components/AccessGate";
import { useRouter } from "next/navigation";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import RowActionsMenu from "@/components/enterprise/RowActionsMenu";
import AgreementExpiryCell from "@/components/AgreementExpiryCell";
import FilterDrawer from "@/components/enterprise/FilterDrawer";
import Toast from "@/components/Toast";
import { SlidersHorizontal } from "lucide-react";

export default function ClientsPage() {
  const router = useRouter();
  const { data: clients = [], error: swrError, isLoading, mutate } = useSWR<ClientRow[]>("/api/clients");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [expandedContactsId, setExpandedContactsId] = useState<number | null>(null);
  const [filterDrawer, setFilterDrawer] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(null);

  async function onDelete(id: number) {
    try {
      await apiFetchJson(`/api/clients/${id}`, { method: "DELETE" });
      void mutate((prev) => (prev ? prev.filter((x) => x.id !== id) : prev), { revalidate: true });
      setToast({ message: "Client deleted.", variant: "success" });
    } catch (e) {
      const msg = e instanceof ApiError && e.status === 403
        ? `${e.message} — vendors.manage is required.`
        : (e as Error)?.message || "Delete failed";
      setToast({ message: msg, variant: "error" });
    }
  }

  return (
    <AccessGate permissionKey="vendors.view">
      {toast ? <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} autoHideMs={3500} /> : null}
      <FilterDrawer open={filterDrawer} onClose={() => setFilterDrawer(false)} title="Client filters" onApply={() => setFilterDrawer(false)}>
        <p className="text-sm text-slate-600 dark:text-slate-400">Advanced client segmentation — coming next (industry, tier, renewal window).</p>
      </FilterDrawer>

      <ModulePageFrame
        title="Clients"
        subtitle="Enterprise accounts, SPOCs, and agreement renewals."
        metrics={
          swrError ? (
            <span className="text-red-600 dark:text-red-400">{(swrError as Error).message}</span>
          ) : isLoading ? (
            <span className="text-slate-500">Loading…</span>
          ) : (
            <span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">{clients.length}</span> clients
            </span>
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilterDrawer(true)} className={UI.secondaryButton + " py-2 text-xs"}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              More filters
            </button>
            <button type="button" onClick={() => void mutate()} className={UI.secondaryButton + " py-2 text-xs"}>
              Refresh
            </button>
            <button className={UI.primaryButton + " py-2 text-sm"} onClick={() => { setEditing(null); setOpen(true); }}>
              Add client
            </button>
          </div>
        }
      >
      <div className="space-y-4">

        <ClientModal
          open={open}
          mode={editing ? "edit" : "create"}
          initial={editing}
          onClose={() => setOpen(false)}
          onSaved={(c) => {
            void mutate(
              (prev) => {
                if (!prev) return [c];
                const idx = prev.findIndex((x) => x.id === c.id);
                if (idx === -1) return [c, ...prev];
                const next = [...prev];
                next[idx] = c;
                return next;
              },
              { revalidate: true }
            );
          }}
        />

        {swrError && clients.length === 0 ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm dark:border-rose-900 dark:bg-rose-950/40">
            <div className="text-base font-semibold text-rose-900 dark:text-rose-100">Unable to load clients</div>
            <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{(swrError as Error).message}</p>
            <button type="button" className={UI.secondaryButton + " mt-4 py-2 text-xs"} onClick={() => void mutate()}>
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <div className={`${UI.enterprise.elevatedCard} p-6`}>
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          </div>
        ) : clients.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-600 dark:bg-slate-900/50">
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">No clients yet</div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">Add a client above to get started.</div>
          </div>
        ) : (
          <div className={`${UI.enterprise.elevatedCard} overflow-x-auto`}>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">SPOC Contacts</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Agreement Expiry</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-[15px]">
                {clients.map((c: any) => {
                  const contacts = Array.isArray(c.contacts) ? c.contacts : [];
                  const inline = contacts.slice(0, 2);
                  const rest = Math.max(0, contacts.length - inline.length);
                  return (
                    <tr
                      key={c.id}
                      className="odd:bg-slate-50/50 hover:bg-slate-100/70 cursor-pointer"
                      onClick={() => router.push(`/clients/${c.id}`)}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-blue-700 hover:underline">{c.name}</div>
                        <div className="text-xs text-slate-500">{c.industry || "—"}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          {inline.map((sp: any) => (
                            <div key={sp.id || sp.email || sp.name} className="text-xs text-slate-700">
                              {sp.name} {sp.email ? `(${sp.email})` : ""}
                            </div>
                          ))}
                          {rest > 0 ? (
                            <button
                              className="text-xs font-semibold text-blue-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedContactsId(expandedContactsId === c.id ? null : c.id);
                              }}
                            >
                              +{rest} more
                            </button>
                          ) : null}
                          {expandedContactsId === c.id && contacts.length > 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                              {contacts.map((sp: any) => (
                                <div key={`all-${sp.id || sp.email || sp.name}`} className="text-xs text-slate-700">
                                  {sp.name} {sp.email ? `• ${sp.email}` : ""} {sp.phone ? `• ${sp.phone}` : ""}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <AgreementExpiryCell row={c} />
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActionsMenu
                          ariaLabel={`Actions for ${c.name}`}
                          items={[
                            { type: "link", label: "View profile", href: `/clients/${c.id}` },
                            {
                              type: "button",
                              label: "Edit",
                              onClick: () => {
                                setEditing(c);
                                setOpen(true);
                              },
                            },
                            {
                              type: "button",
                              label: "Delete",
                              danger: true,
                              onClick: () => {
                                void onDelete(c.id);
                              },
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </ModulePageFrame>
    </AccessGate>
  );
}

