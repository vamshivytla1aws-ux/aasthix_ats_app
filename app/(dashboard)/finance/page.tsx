"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";

type Tab = "dashboard" | "partners" | "investments" | "company_account" | "ledger" | "import_audit";
type Partner = { id: number; name: string; email: string | null; roleLabel: string | null; isActive: boolean };
type Tx = {
  id: number;
  kind: string;
  date: string;
  description: string;
  category: string;
  totalMinor: number;
  partnerId: number | null;
  accountEntryType: "debit" | "credit" | null;
};

function inr(minor: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(minor / 100);
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [message, setMessage] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ledger, setLedger] = useState<Tx[]>([]);
  const [batches, setBatches] = useState<Array<{ id: number; batchId: string; source: string; status: string; importedTransactions: number }>>([]);
  const [dashboard, setDashboard] = useState<any>(null);

  const [partnerName, setPartnerName] = useState("");
  const [partnerEmail, setPartnerEmail] = useState("");
  const [partnerRole, setPartnerRole] = useState("");
  const [txKind, setTxKind] = useState("partner_investment");
  const [txDate, setTxDate] = useState(new Date().toISOString().slice(0, 10));
  const [txDesc, setTxDesc] = useState("");
  const [txCategory, setTxCategory] = useState("General");
  const [txAmount, setTxAmount] = useState("");
  const [txPartnerId, setTxPartnerId] = useState("");
  const [txAccountType, setTxAccountType] = useState<"debit" | "credit">("debit");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [snapshotText, setSnapshotText] = useState("");

  const partnerById = useMemo(() => {
    const m = new Map<number, Partner>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);

  async function refresh() {
    try {
      const [workspace, p, tx, b] = await Promise.all([
        apiFetchJson<{ dashboard: any }>("/api/finance/workspace"),
        apiFetchJson<{ partners: Partner[] }>("/api/finance/partners"),
        apiFetchJson<{ transactions: Tx[] }>(`/api/finance/transactions?kind=${encodeURIComponent(kindFilter)}&q=${encodeURIComponent(search)}&sort=desc`),
        apiFetchJson<{ batches: any[] }>("/api/finance/batches"),
      ]);
      setDashboard(workspace.dashboard);
      setPartners(p.partners ?? []);
      setLedger(tx.transactions ?? []);
      setBatches(b.batches ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load finance");
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, search]);

  async function addPartner(e: React.FormEvent) {
    e.preventDefault();
    await apiFetchJson("/api/finance/partners", {
      method: "POST",
      body: JSON.stringify({ name: partnerName, email: partnerEmail || null, roleLabel: partnerRole || null }),
    });
    setPartnerName("");
    setPartnerEmail("");
    setPartnerRole("");
    setMessage("Partner added.");
    await refresh();
  }

  async function togglePartner(p: Partner) {
    await apiFetchJson("/api/finance/partners", {
      method: "PUT",
      body: JSON.stringify({ id: p.id, name: p.name, email: p.email, roleLabel: p.roleLabel, isActive: !p.isActive }),
    });
    await refresh();
  }

  async function saveTx(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      kind: txKind,
      date: txDate,
      description: txDesc || "Entry",
      category: txCategory,
      amount: txAmount,
    };
    if (txKind === "partner_investment") {
      const partnerId = Number(txPartnerId);
      payload.partnerId = partnerId;
      payload.payments = [{ partnerId, amountMinor: Math.round(Number(txAmount || "0") * 100) }];
      payload.shares = [];
    }
    if (txKind === "company_account_entry") payload.accountEntryType = txAccountType;
    await apiFetchJson("/api/finance/transactions", { method: "POST", body: JSON.stringify(payload) });
    setTxDesc("");
    setTxAmount("");
    setMessage("Saved.");
    await refresh();
  }

  async function removeTx(id: number) {
    await apiFetchJson(`/api/finance/transactions?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  async function importSnapshot() {
    const payload = JSON.parse(snapshotText);
    await apiFetchJson("/api/finance/import-snapshot", { method: "POST", body: JSON.stringify({ payload }) });
    setMessage("Snapshot imported.");
    await refresh();
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
        <h1 className="text-2xl font-semibold text-[var(--ats-text)]">Finance</h1>
        <p className="text-sm text-[var(--ats-text-muted)]">Native ATS module (Postgres-backed).</p>
        {message ? <p className="mt-2 text-sm text-emerald-600">{message}</p> : null}
      </section>

      <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-3">
        <div className="flex flex-wrap gap-2">
          {[
            ["dashboard", "Dashboard"],
            ["partners", "Partners"],
            ["investments", "Partner Investments"],
            ["company_account", "Company Account"],
            ["ledger", "Ledger"],
            ["import_audit", "Import & Audit"],
          ].map(([key, label]) => (
            <button key={key} className={`rounded-xl px-3 py-2 text-sm font-semibold ${tab === key ? "bg-indigo-600 text-white" : "border border-[var(--ats-border)]"}`} onClick={() => setTab(key as Tab)} type="button">
              {label}
            </button>
          ))}
        </div>
      </section>

      {tab === "dashboard" && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Total partners invested</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalPartnerInvestedMinor ?? 0)}</p></article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Total company expenses</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalCompanyExpensesMinor ?? 0)}</p></article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Company credits</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalCompanyAccountCreditsMinor ?? 0)}</p></article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Company account balance</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.companyAccountBalanceMinor ?? 0)}</p></article>
        </section>
      )}

      {tab === "partners" && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
            <form className="space-y-2" onSubmit={addPartner}>
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" placeholder="Name" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" placeholder="Email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" placeholder="Role label" value={partnerRole} onChange={(e) => setPartnerRole(e.target.value)} />
              <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="submit">Save partner</button>
            </form>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4 lg:col-span-2">
            <table className="w-full text-sm"><thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>{partners.map((p) => <tr className="border-t border-[var(--ats-border)]" key={p.id}><td className="py-2">{p.name}</td><td>{p.email ?? "-"}</td><td>{p.roleLabel ?? "-"}</td><td>{p.isActive ? "Active" : "Inactive"}</td><td><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => togglePartner(p)}>{p.isActive ? "Deactivate" : "Reactivate"}</button></td></tr>)}</tbody>
            </table>
          </article>
        </section>
      )}

      {(tab === "investments" || tab === "company_account") && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
            <form className="space-y-2" onSubmit={saveTx}>
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
              {tab === "investments" ? (
                <select className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" value={txPartnerId} onChange={(e) => setTxPartnerId(e.target.value)}>
                  <option value="">Select partner</option>
                  {partners.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <select className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" value={txAccountType} onChange={(e) => setTxAccountType(e.target.value as "debit" | "credit")}>
                  <option value="debit">Debit</option><option value="credit">Credit</option>
                </select>
              )}
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" placeholder="Description" value={txDesc} onChange={(e) => setTxDesc(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" placeholder="Category" value={txCategory} onChange={(e) => setTxCategory(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" placeholder="Amount" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
              <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="submit">Save entry</button>
            </form>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4 lg:col-span-2">
            <table className="w-full text-sm"><thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Date</th><th>Description</th><th>Partner</th><th>Type</th><th className="text-right">Amount</th><th>Action</th></tr></thead>
              <tbody>{ledger.filter((tx) => (tab === "investments" ? tx.kind === "partner_investment" || tx.kind === "expense" : tx.kind === "company_account_entry")).map((tx) => <tr className="border-t border-[var(--ats-border)]" key={tx.id}><td className="py-2">{tx.date}</td><td>{tx.description}</td><td>{tx.partnerId ? partnerById.get(tx.partnerId)?.name ?? "-" : "-"}</td><td>{tx.accountEntryType ?? tx.kind}</td><td className="text-right">{inr(tx.totalMinor)}</td><td><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => removeTx(tx.id)}>Delete</button></td></tr>)}</tbody>
            </table>
          </article>
        </section>
      )}

      {tab === "ledger" && (
        <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2 text-sm" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2 text-sm" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">All</option><option value="partner_investment">Partner investment</option><option value="company_expense">Company expense</option><option value="company_inflow">Company inflow</option><option value="company_account_entry">Company account</option><option value="expense">Imported expense</option>
            </select>
          </div>
          <table className="w-full text-sm"><thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Date</th><th>Description</th><th>Category</th><th>Kind</th><th className="text-right">Amount</th><th>Action</th></tr></thead>
            <tbody>{ledger.map((tx) => <tr className="border-t border-[var(--ats-border)]" key={tx.id}><td className="py-2">{tx.date}</td><td>{tx.description}</td><td>{tx.category}</td><td>{tx.kind}</td><td className="text-right">{inr(tx.totalMinor)}</td><td><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => removeTx(tx.id)}>Delete</button></td></tr>)}</tbody>
          </table>
        </section>
      )}

      {tab === "import_audit" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
            <h3 className="text-base font-semibold">Import groups-split-web JSON snapshot</h3>
            <textarea className="mt-3 min-h-[220px] w-full rounded-xl border border-[var(--ats-border)] bg-transparent p-3 text-sm" placeholder='{"transactions":[...]}' value={snapshotText} onChange={(e) => setSnapshotText(e.target.value)} />
            <button className="mt-3 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={importSnapshot}>Import snapshot</button>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
            <h3 className="text-base font-semibold">Import batch audit</h3>
            <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Batch</th><th>Source</th><th>Status</th><th className="text-right">Imported</th></tr></thead>
              <tbody>{batches.map((b) => <tr className="border-t border-[var(--ats-border)]" key={b.id}><td className="py-2">{b.batchId}</td><td>{b.source}</td><td>{b.status}</td><td className="text-right">{b.importedTransactions}</td></tr>)}</tbody>
            </table>
          </article>
        </section>
      )}
    </div>
  );
}
