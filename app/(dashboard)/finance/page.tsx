"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";

type Tab = "dashboard" | "partners" | "partner_accounts" | "investments" | "company_account" | "ledger" | "import_audit";
type Preset = "full" | "monthly" | "yearly" | "custom";

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

function todayMonth() {
  return new Date().toISOString().slice(0, 7);
}

function thisYear() {
  return String(new Date().getFullYear());
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [message, setMessage] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ledger, setLedger] = useState<Tx[]>([]);
  const [batches, setBatches] = useState<Array<{ id: number; batchId: string; source: string; status: string; importedTransactions: number }>>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);

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
  const [snapshotPayload, setSnapshotPayload] = useState<any>(null);
  const [restorePreview, setRestorePreview] = useState<any>(null);
  const [restorePayload, setRestorePayload] = useState<any>(null);

  const [rangePreset, setRangePreset] = useState<Preset>("full");
  const [rangeMonth, setRangeMonth] = useState(todayMonth());
  const [rangeYear, setRangeYear] = useState(thisYear());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  const [selectedPartnerId, setSelectedPartnerId] = useState<number>(0);
  const [partnerStatement, setPartnerStatement] = useState<any>(null);
  const backupImportInputRef = useRef<HTMLInputElement | null>(null);

  const rangeQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("preset", rangePreset);
    if (rangePreset === "monthly") p.set("month", rangeMonth);
    if (rangePreset === "yearly") p.set("year", rangeYear);
    if (rangePreset === "custom") {
      if (rangeFrom) p.set("from", rangeFrom);
      if (rangeTo) p.set("to", rangeTo);
    }
    return p.toString();
  }, [rangePreset, rangeMonth, rangeYear, rangeFrom, rangeTo]);

  const partnerById = useMemo(() => {
    const m = new Map<number, Partner>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);

  async function refreshBase() {
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
  }

  async function refreshAnalytics() {
    const res = await apiFetchJson<{ analytics: any }>(`/api/finance/analytics?${rangeQuery}`);
    setAnalytics(res.analytics);
  }

  async function refreshPartnerStatement(partnerId: number) {
    if (!partnerId) return;
    const res = await apiFetchJson<{ summary: any }>(`/api/finance/partner-accounts?partnerId=${partnerId}&${rangeQuery}`);
    setPartnerStatement(res.summary);
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshBase();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load finance");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kindFilter, search]);

  useEffect(() => {
    (async () => {
      try {
        await refreshAnalytics();
        if (selectedPartnerId) await refreshPartnerStatement(selectedPartnerId);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Failed to load analytics");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeQuery, selectedPartnerId]);

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
    await refreshBase();
  }

  async function togglePartner(p: Partner) {
    await apiFetchJson("/api/finance/partners", {
      method: "PUT",
      body: JSON.stringify({ id: p.id, name: p.name, email: p.email, roleLabel: p.roleLabel, isActive: !p.isActive }),
    });
    await refreshBase();
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
    await refreshBase();
    await refreshAnalytics();
  }

  async function removeTx(id: number) {
    await apiFetchJson(`/api/finance/transactions?id=${id}`, { method: "DELETE" });
    await refreshBase();
    await refreshAnalytics();
    if (selectedPartnerId) await refreshPartnerStatement(selectedPartnerId);
  }

  async function importSnapshot() {
    let payload: any = snapshotPayload;
    if (!payload && snapshotText.trim()) payload = JSON.parse(snapshotText);
    if (!payload) throw new Error("Select a snapshot JSON file or paste JSON payload.");
    const res = await apiFetchJson<{ result: { imported: number } }>("/api/finance/import-snapshot", {
      method: "POST",
      body: JSON.stringify({ payload }),
    });
    setMessage(`Snapshot imported. Rows: ${res.result?.imported ?? 0}`);
    setSnapshotText("");
    setSnapshotPayload(null);
    await refreshBase();
    await refreshAnalytics();
    if (selectedPartnerId) await refreshPartnerStatement(selectedPartnerId);
  }

  async function handleSnapshotFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = JSON.parse(text);
    setSnapshotPayload(parsed);
    setSnapshotText("");
    setMessage(`Snapshot file loaded: ${file.name}`);
  }

  async function exportBackup() {
    const res = await apiFetchJson<{ backup: any }>("/api/finance/backup");
    const blob = new Blob([JSON.stringify(res.backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Finance backup exported.");
  }

  async function handleRestoreFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const backup = JSON.parse(text);
    const previewRes = await apiFetchJson<{ preview: any }>("/api/finance/restore/preview", {
      method: "POST",
      body: JSON.stringify({ backup }),
    });
    setRestorePayload(backup);
    setRestorePreview(previewRes.preview);
    setMessage("Restore preview ready.");
  }

  function triggerBackupImportPicker() {
    backupImportInputRef.current?.click();
  }

  async function applyRestore() {
    if (!restorePayload) return;
    await apiFetchJson("/api/finance/restore/apply", {
      method: "POST",
      body: JSON.stringify({ backup: restorePayload }),
    });
    setRestorePayload(null);
    setRestorePreview(null);
    setMessage("Restore applied successfully.");
    await refreshBase();
    await refreshAnalytics();
    if (selectedPartnerId) await refreshPartnerStatement(selectedPartnerId);
  }

  function openPartnerExport(type: "csv" | "pdf") {
    if (!selectedPartnerId) return;
    const href = `/api/finance/partner-accounts?partnerId=${selectedPartnerId}&${rangeQuery}&export=${type}`;
    window.open(href, "_blank", "noopener,noreferrer");
  }

  function applyLedgerDrill(kind: string) {
    setKindFilter(kind);
    setTab("ledger");
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
        <h1 className="text-2xl font-semibold text-[var(--ats-text)]">Finance</h1>
        <p className="text-sm text-[var(--ats-text-muted)]">Native ATS enterprise finance workspace (Postgres-backed).</p>
        {message ? <p className="mt-2 text-sm text-emerald-600">{message}</p> : null}
      </section>

      <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-3">
        <div className="flex flex-wrap gap-2">
          {[
            ["dashboard", "Dashboard"],
            ["partners", "Partners"],
            ["partner_accounts", "Partner Accounts"],
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

      <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--ats-text-muted)]">Range</span>
          <select className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangePreset} onChange={(e) => setRangePreset(e.target.value as Preset)}>
            <option value="full">Full</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
            <option value="custom">Custom</option>
          </select>
          {rangePreset === "monthly" ? <input className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangeMonth} onChange={(e) => setRangeMonth(e.target.value)} placeholder="YYYY-MM" /> : null}
          {rangePreset === "yearly" ? <input className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangeYear} onChange={(e) => setRangeYear(e.target.value)} placeholder="YYYY" /> : null}
          {rangePreset === "custom" ? (
            <>
              <input className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="From YYYY-MM-DD" />
              <input className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder="To YYYY-MM-DD" />
            </>
          ) : null}
        </div>
      </section>

      {tab === "dashboard" && (
        <div className="space-y-4">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Total partners invested</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalPartnerInvestedMinor ?? 0)}</p></article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Total company expenses</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalCompanyExpensesMinor ?? 0)}</p></article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Company credits</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalCompanyAccountCreditsMinor ?? 0)}</p></article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Company account balance</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.companyAccountBalanceMinor ?? 0)}</p></article>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-base font-semibold">Monthly invested vs company expenses</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.monthlyInvestedVsExpenses ?? []).map((r: any) => (
                  <button key={r.month} type="button" onClick={() => applyLedgerDrill("partner_investment")} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{r.month}</span>
                    <span>{inr(r.investedMinor)} / {inr(r.expensesMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-base font-semibold">Company account balance trend</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.companyBalanceTrend ?? []).map((r: any) => (
                  <div key={r.month} className="flex justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-sm">
                    <span>{r.month}</span>
                    <span>{inr(r.balanceMinor)}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-base font-semibold">Partner contribution share</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.partnerContributionShare ?? []).map((r: any) => (
                  <button key={r.partnerId} type="button" onClick={() => { setSelectedPartnerId(r.partnerId); setTab("partner_accounts"); }} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{r.partnerName}</span>
                    <span>{r.sharePercent}%</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-base font-semibold">Equalization gap by partner</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.equalizationGapByPartner ?? []).map((r: any) => (
                  <button key={r.partnerId} type="button" onClick={() => { setSelectedPartnerId(r.partnerId); setTab("partner_accounts"); }} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{r.partnerName}</span>
                    <span>{inr(r.deltaMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-base font-semibold">Category spend mix</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.categorySpendMix ?? []).map((r: any) => (
                  <button key={r.category} type="button" onClick={() => { setKindFilter("company_expense"); setSearch(r.category); setTab("ledger"); }} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{r.category}</span>
                    <span>{inr(r.amountMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-base font-semibold">Recent ledger</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.recentLedger ?? []).map((r: any) => (
                  <button key={`${r.id}-${r.date}`} type="button" onClick={() => { setSearch(r.description); setTab("ledger"); }} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span className="truncate pr-2">{r.description}</span>
                    <span>{inr(r.totalMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        </div>
      )}

      {tab === "partner_accounts" && (
        <section className="space-y-3 rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={selectedPartnerId || ""} onChange={(e) => setSelectedPartnerId(Number(e.target.value))}>
              <option value="">Select partner</option>
              {partners.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="rounded-lg border border-[var(--ats-border)] px-2 py-1 text-sm" onClick={() => openPartnerExport("csv")} disabled={!selectedPartnerId}>Export CSV</button>
            <button type="button" className="rounded-lg border border-[var(--ats-border)] px-2 py-1 text-sm" onClick={() => openPartnerExport("pdf")} disabled={!selectedPartnerId}>Export PDF</button>
          </div>
          {!partnerStatement ? <p className="text-sm text-[var(--ats-text-muted)]">Select a partner to view statement.</p> : (
            <>
              <div className="grid gap-2 md:grid-cols-4">
                <div className="rounded-xl border border-[var(--ats-border)] p-2 text-sm"><div className="text-xs text-[var(--ats-text-muted)]">Invested</div><div className="font-semibold">{inr(partnerStatement.totalInvestedMinor)}</div></div>
                <div className="rounded-xl border border-[var(--ats-border)] p-2 text-sm"><div className="text-xs text-[var(--ats-text-muted)]">Debit</div><div className="font-semibold">{inr(partnerStatement.totalDebitMinor)}</div></div>
                <div className="rounded-xl border border-[var(--ats-border)] p-2 text-sm"><div className="text-xs text-[var(--ats-text-muted)]">Credit</div><div className="font-semibold">{inr(partnerStatement.totalCreditMinor)}</div></div>
                <div className="rounded-xl border border-[var(--ats-border)] p-2 text-sm"><div className="text-xs text-[var(--ats-text-muted)]">Net</div><div className="font-semibold">{inr(partnerStatement.netMinor)}</div></div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Date</th><th>Narration</th><th>Category</th><th className="text-right">Invested</th><th className="text-right">Running</th></tr></thead>
                  <tbody>
                    {(partnerStatement.rows ?? []).map((row: any) => (
                      <tr className="border-t border-[var(--ats-border)]" key={row.txId}>
                        <td className="py-2">{row.date}</td><td>{row.narration}</td><td>{row.category}</td><td className="text-right">{inr(row.investedMinor)}</td><td className="text-right">{inr(row.runningBalanceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
            <h3 className="text-base font-semibold">Backup & restore</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={exportBackup}>Export Finance Backup</button>
              <button className="rounded-xl border border-[var(--ats-border)] px-3 py-2 text-sm font-semibold" type="button" onClick={triggerBackupImportPicker}>
                Import from Export JSON file
              </button>
              <label className="rounded-xl border border-[var(--ats-border)] px-3 py-2 text-sm font-semibold">
                Select backup file
                <input ref={backupImportInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
              </label>
            </div>
            {restorePreview ? (
              <div className="mt-3 rounded-xl border border-amber-400/60 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-semibold">Restore preview</p>
                <p>Workspace: {restorePreview.workspaceName}</p>
                <p>Partners: {restorePreview.partnerCount}</p>
                <p>Transactions: {restorePreview.transactionCount}</p>
                <p>Invested: {inr(restorePreview.totalInvestedMinor)}</p>
                <p>Expenses: {inr(restorePreview.totalCompanyExpensesMinor)}</p>
                {restorePreview.warnings?.length ? <p>Warnings: {restorePreview.warnings.join(" | ")}</p> : null}
                <div className="mt-2">
                  <button className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white" type="button" onClick={applyRestore}>
                    Confirm restore (replace workspace)
                  </button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
            <h3 className="text-base font-semibold">Import groups-split-web JSON snapshot</h3>
            <div className="mt-3">
              <label className="inline-flex cursor-pointer rounded-xl border border-[var(--ats-border)] px-3 py-2 text-sm font-semibold">
                Select snapshot file
                <input type="file" accept="application/json,.json" className="hidden" onChange={handleSnapshotFile} />
              </label>
            </div>
            <textarea className="mt-3 min-h-[220px] w-full rounded-xl border border-[var(--ats-border)] bg-transparent p-3 text-sm" placeholder='{"transactions":[...]}' value={snapshotText} onChange={(e) => setSnapshotText(e.target.value)} />
            <button className="mt-3 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={importSnapshot}>Import snapshot</button>
          </article>

          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4 lg:col-span-2">
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
