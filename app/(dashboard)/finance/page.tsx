"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";

type Tab = "dashboard" | "partners" | "partner_accounts" | "investments" | "company_account" | "direct_others" | "ledger" | "import_audit";
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

function toDisplayDate(value: string) {
  const v = (value ?? "").trim();
  const ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[3]}-${ymd[2]}-${ymd[1]}`;
  const dmySlash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmySlash) return `${dmySlash[1]}-${dmySlash[2]}-${dmySlash[3]}`;
  return v;
}

function toApiDate(value: string) {
  const v = (value ?? "").trim();
  const dmyDash = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`;
  const dmySlash = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2]}-${dmySlash[1]}`;
  return v;
}

function todayDdMmYyyy() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
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

  const [txDate, setTxDate] = useState(todayDdMmYyyy());
  const [txDesc, setTxDesc] = useState("");
  const [txCategory, setTxCategory] = useState("General");
  const [txAmount, setTxAmount] = useState("");
  const [txPartnerId, setTxPartnerId] = useState("");
  const [txAccountType, setTxAccountType] = useState<"debit" | "credit">("debit");
  const [postToDirectOthers, setPostToDirectOthers] = useState(false);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);

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
  const [contributionTargetMinor, setContributionTargetMinor] = useState<number>(100000000);

  const rangeQuery = useMemo(() => {
    const p = new URLSearchParams();
    p.set("preset", rangePreset);
    if (rangePreset === "monthly") p.set("month", rangeMonth);
    if (rangePreset === "yearly") p.set("year", rangeYear);
    if (rangePreset === "custom") {
      if (rangeFrom) p.set("from", toApiDate(rangeFrom));
      if (rangeTo) p.set("to", toApiDate(rangeTo));
    }
    return p.toString();
  }, [rangePreset, rangeMonth, rangeYear, rangeFrom, rangeTo]);

  const partnerById = useMemo(() => {
    const m = new Map<number, Partner>();
    for (const p of partners) m.set(p.id, p);
    return m;
  }, [partners]);
  const maxMonthlyExpenseMinor = useMemo(() => {
    const values = (analytics?.monthlyInvestedVsExpenses ?? []).map((r: any) =>
      Math.max(Number(r.investedMinor ?? 0), Number(r.expensesMinor ?? 0))
    );
    return Math.max(...values, 1);
  }, [analytics]);
  const maxEqualizationMinor = useMemo(() => {
    const values = (analytics?.equalizationGapByPartner ?? []).map((r: any) => Math.abs(Number(r.deltaMinor ?? 0)));
    return Math.max(...values, 1);
  }, [analytics]);
  const cashStrip = useMemo(() => {
    const monthExpenses = (analytics?.monthlyInvestedVsExpenses ?? []).map((r: any) => Number(r.expensesMinor ?? 0));
    const avgMonthlyOutflowMinor = monthExpenses.length
      ? Math.round(monthExpenses.reduce((sum: number, v: number) => sum + v, 0) / monthExpenses.length)
      : 0;
    const companyBalanceMinor = Number(dashboard?.companyAccountBalanceMinor ?? 0);
    const runwayMonths = avgMonthlyOutflowMinor > 0 ? companyBalanceMinor / avgMonthlyOutflowMinor : 0;
    return { avgMonthlyOutflowMinor, runwayMonths };
  }, [analytics, dashboard]);

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
    const activeKind = tab === "company_account" ? "company_account_entry" : tab === "direct_others" ? "direct_others_account_entry" : "partner_investment";
    const payload: Record<string, unknown> = {
      kind: activeKind,
      date: toApiDate(txDate),
      description: txDesc || "Entry",
      category: txCategory,
      amount: txAmount,
    };
    if (activeKind === "partner_investment") {
      const partnerId = Number(txPartnerId);
      payload.partnerId = partnerId;
      payload.payments = [{ partnerId, amountMinor: Math.round(Number(txAmount || "0") * 100) }];
      payload.shares = [];
    }
    if (activeKind === "company_account_entry" || activeKind === "direct_others_account_entry") payload.accountEntryType = txAccountType;
    if (editingTxId) payload.id = editingTxId;
    await apiFetchJson("/api/finance/transactions", {
      method: editingTxId ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    if (!editingTxId && activeKind === "partner_investment" && postToDirectOthers) {
      await apiFetchJson("/api/finance/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind: "direct_others_account_entry",
          date: toApiDate(txDate),
          description: txDesc || "Partner investment mirrored to direct/others",
          category: txCategory,
          amount: txAmount,
          accountEntryType: "credit",
          metadata: { linkedSource: "partner_investment" },
        }),
      });
    }
    setTxDesc("");
    setTxAmount("");
    setEditingTxId(null);
    setPostToDirectOthers(false);
    setTxDate(todayDdMmYyyy());
    setMessage(editingTxId ? "Entry updated." : "Saved.");
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
    const res = await apiFetchJson<{ result: { imported: number; skipped?: number; errors?: string[] } }>("/api/finance/import-snapshot", {
      method: "POST",
      body: JSON.stringify({ payload }),
    });
    const imported = res.result?.imported ?? 0;
    const skipped = res.result?.skipped ?? 0;
    const sampleErrors = (res.result?.errors ?? []).slice(0, 2).join(" | ");
    setMessage(`Snapshot imported. Rows: ${imported}${skipped ? `, skipped: ${skipped}` : ""}${sampleErrors ? ` - ${sampleErrors}` : ""}`);
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

  function editTx(tx: Tx) {
    setEditingTxId(tx.id);
    setTxDate(toDisplayDate(tx.date));
    setTxDesc(tx.description ?? "");
    setTxCategory(tx.category ?? "General");
    setTxAmount((Number(tx.totalMinor ?? 0) / 100).toString());
    setTxPartnerId(tx.partnerId ? String(tx.partnerId) : "");
    setTxAccountType(tx.accountEntryType ?? "debit");
    setTab(tx.kind === "company_account_entry" ? "company_account" : tx.kind === "direct_others_account_entry" ? "direct_others" : "investments");
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
            ["direct_others", "Direct/Others Account"],
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
              <input className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="From dd-mm-yyyy" />
              <input className="rounded-lg border border-[var(--ats-border)] bg-transparent px-2 py-1 text-sm" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder="To dd-mm-yyyy" />
            </>
          ) : null}
        </div>
      </section>

      {tab === "dashboard" && (
        <div className="space-y-4">
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Account balance</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.companyAccountBalanceMinor ?? 0)}</p><p className="mt-1 text-xs text-[var(--ats-text-muted)]">As of: {dashboard?.accountBalanceAsOf ? toDisplayDate(dashboard.accountBalanceAsOf) : "-"}</p></article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">This month inflow</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.thisMonthInflowMinor ?? 0)}</p></article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">This month outflow</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.thisMonthOutflowMinor ?? 0)}</p></article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4"><p className="text-xs text-[var(--ats-text-muted)]">Total partners invested</p><p className="mt-2 text-xl font-semibold">{inr(dashboard?.totalPartnerInvestedMinor ?? 0)}</p></article>
          </section>

          <section className="rounded-2xl border border-cyan-500/30 bg-gradient-to-r from-slate-950 to-slate-900 p-4 text-slate-100 shadow-sm">
            <h3 className="text-2xl font-semibold">Cash Position Strip</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-300">
                Runway: {Number.isFinite(cashStrip.runwayMonths) ? cashStrip.runwayMonths.toFixed(1) : "0.0"} months
              </span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-300">
                Avg Monthly Outflow: {inr(cashStrip.avgMonthlyOutflowMinor)}
              </span>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-semibold text-emerald-300">
                Partner Invested (supporting): {inr(Number(dashboard?.totalPartnerInvestedMinor ?? 0))}
              </span>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-3xl font-semibold leading-tight">Monthly Invested vs Company Expenses</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.monthlyInvestedVsExpenses ?? []).map((r: any) => (
                  <button key={r.month} type="button" onClick={() => applyLedgerDrill("partner_investment")} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{String(r.month)}</span>
                    <div className="mx-3 h-3 flex-1 overflow-hidden rounded-full bg-slate-900/60">
                      <div className="h-full rounded-full bg-sky-400" style={{ width: `${Math.max((Math.max(Number(r.investedMinor ?? 0), Number(r.expensesMinor ?? 0)) / maxMonthlyExpenseMinor) * 100, 4)}%` }} />
                    </div>
                    <span className="tabular-nums">{inr(r.investedMinor)} / {inr(r.expensesMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-3xl font-semibold leading-tight">Partner Contribution Share</h3>
              <div className="mt-3">
                <input
                  className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2 text-sm"
                  value={(contributionTargetMinor / 100).toString()}
                  onChange={(e) => {
                    const amount = Number(e.target.value);
                    if (Number.isFinite(amount) && amount > 0) setContributionTargetMinor(Math.round(amount * 100));
                  }}
                  placeholder="Contribution target"
                />
                <p className="mt-2 text-sm text-[var(--ats-text-muted)]">100% is reached at {inr(contributionTargetMinor)}</p>
              </div>
              <div className="mt-2 space-y-1">
                {(analytics?.partnerContributionShare ?? []).map((r: any) => (
                  <button key={r.partnerId} type="button" onClick={() => { setSelectedPartnerId(r.partnerId); setTab("partner_accounts"); }} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{r.partnerName}</span>
                    <span>{Math.min(999, (Number(r.investedMinor ?? 0) / Math.max(contributionTargetMinor, 1)) * 100).toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
              <h3 className="text-3xl font-semibold leading-tight">Equalization Gap by Partner</h3>
              <div className="mt-2 space-y-1">
                {(analytics?.equalizationGapByPartner ?? []).map((r: any) => (
                  <button key={r.partnerId} type="button" onClick={() => { setSelectedPartnerId(r.partnerId); setTab("partner_accounts"); }} className="flex w-full justify-between rounded-lg border border-[var(--ats-border)] px-2 py-1 text-left text-sm">
                    <span>{r.partnerName}</span>
                    <div className="mx-3 h-3 flex-1 overflow-hidden rounded-full bg-slate-900/60">
                      <div className="h-full rounded-full bg-teal-400" style={{ width: `${Math.max((Math.abs(Number(r.deltaMinor ?? 0)) / maxEqualizationMinor) * 100, 4)}%` }} />
                    </div>
                    <span>{inr(r.deltaMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="grid gap-3 md:grid-cols-2">
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

          <section className="rounded-2xl border border-[var(--ats-border)] bg-slate-950/70 p-4 text-slate-100">
            <h3 className="text-2xl font-semibold">Equalization board</h3>
            <p className="mt-2 text-sm text-slate-300">
              Total partner invested: {inr(Number(dashboard?.totalPartnerInvestedMinor ?? 0))} · Active partners: {(dashboard?.equalization ?? []).length} · Benchmark (highest invested): {inr(Math.max(...(dashboard?.equalization ?? []).map((r: any) => Number(r.investedMinor ?? 0)), 0))}
            </p>
            <div className="mt-3 overflow-auto rounded-xl border border-slate-700/60">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/70 text-left text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Partner</th>
                    <th className="px-3 py-2 text-right">Invested till now</th>
                    <th className="px-3 py-2 text-right">Delta to equal</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboard?.equalization ?? []).map((row: any) => (
                    <tr key={row.partnerId} className="border-t border-slate-700/60">
                      <td className="px-3 py-2">{row.partnerName}</td>
                      <td className="px-3 py-2 text-right">{inr(row.investedMinor)}</td>
                      <td className="px-3 py-2 text-right">{inr(row.deltaToEqualMinor)}</td>
                      <td className="px-3 py-2">{Number(row.deltaToEqualMinor) > 0 ? `Owes company ${inr(row.deltaToEqualMinor)}` : "Benchmark matched"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--ats-border)] bg-slate-950/70 p-4 text-slate-100">
            <h3 className="text-2xl font-semibold">Splitwise member totals</h3>
            <div className="mt-3 overflow-auto rounded-xl border border-slate-700/60">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/70 text-left text-slate-300">
                  <tr>
                    <th className="px-3 py-2">Member</th>
                    <th className="px-3 py-2 text-right">Paid</th>
                    <th className="px-3 py-2 text-right">Share/Owes</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dashboard?.splitwiseSummary?.memberTotals ?? {}).map(([member, totals]: any) => (
                    <tr key={member} className="border-t border-slate-700/60">
                      <td className="px-3 py-2">{member}</td>
                      <td className="px-3 py-2 text-right">{inr(totals.paidCents)}</td>
                      <td className="px-3 py-2 text-right">{inr(totals.shareCents)}</td>
                      <td className="px-3 py-2 text-right">{inr(totals.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-600/70 bg-slate-900/40 font-semibold">
                  <tr>
                    <td className="px-3 py-2">Total</td>
                    <td className="px-3 py-2 text-right">{inr(Number(dashboard?.splitwiseSummary?.totalPaidCents ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(dashboard?.splitwiseSummary?.totalShareCents ?? 0))}</td>
                    <td className="px-3 py-2 text-right">{inr(Number(dashboard?.splitwiseSummary?.totalBalanceCents ?? 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
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
                        <td className="py-2">{toDisplayDate(row.date)}</td><td>{row.narration}</td><td>{row.category}</td><td className="text-right">{inr(row.investedMinor)}</td><td className="text-right">{inr(row.runningBalanceMinor)}</td>
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

      {(tab === "investments" || tab === "company_account" || tab === "direct_others") && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
            <form className="space-y-2" onSubmit={saveTx}>
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2" value={txDate} onChange={(e) => setTxDate(e.target.value)} placeholder="dd-mm-yyyy" />
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
              {tab === "investments" ? (
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={postToDirectOthers} onChange={(e) => setPostToDirectOthers(e.target.checked)} />
                  Post to Direct/Others account (credit)
                </label>
              ) : null}
              <button className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="submit">{editingTxId ? "Update entry" : "Save entry"}</button>
              {editingTxId ? <button className="rounded-xl border border-[var(--ats-border)] px-3 py-2 text-sm font-semibold" type="button" onClick={() => { setEditingTxId(null); setTxDate(todayDdMmYyyy()); setTxDesc(""); setTxCategory("General"); setTxAmount(""); setTxPartnerId(""); setTxAccountType("debit"); setPostToDirectOthers(false); }}>Cancel edit</button> : null}
            </form>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4 lg:col-span-2">
            <table className="w-full text-sm"><thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Date</th><th>Description</th><th>Partner</th><th>Type</th><th className="text-right">Amount</th><th>Action</th></tr></thead>
              <tbody>{ledger.filter((tx) => (tab === "investments" ? tx.kind === "partner_investment" || tx.kind === "expense" : tab === "direct_others" ? tx.kind === "direct_others_account_entry" : tx.kind === "company_account_entry")).map((tx) => <tr className="border-t border-[var(--ats-border)]" key={tx.id}><td className="py-2">{toDisplayDate(tx.date)}</td><td>{tx.description}</td><td>{tx.partnerId ? partnerById.get(tx.partnerId)?.name ?? "-" : "-"}</td><td>{tx.accountEntryType ?? tx.kind}</td><td className="text-right">{inr(tx.totalMinor)}</td><td className="space-x-2"><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => editTx(tx)}>Edit</button><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => removeTx(tx.id)}>Delete</button></td></tr>)}</tbody>
            </table>
          </article>
        </section>
      )}

      {tab === "ledger" && (
        <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2 text-sm" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-xl border border-[var(--ats-border)] bg-transparent px-3 py-2 text-sm" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">All</option><option value="partner_investment">Partner investment</option><option value="company_expense">Company expense</option><option value="company_inflow">Company inflow</option><option value="company_account_entry">Company account</option><option value="direct_others_account_entry">Direct/Others account</option><option value="expense">Imported expense</option>
            </select>
          </div>
          <table className="w-full text-sm"><thead><tr className="text-left text-[var(--ats-text-muted)]"><th className="py-2">Date</th><th>Description</th><th>Category</th><th>Kind</th><th className="text-right">Amount</th><th>Action</th></tr></thead>
            <tbody>{ledger.map((tx) => <tr className="border-t border-[var(--ats-border)]" key={tx.id}><td className="py-2">{toDisplayDate(tx.date)}</td><td>{tx.description}</td><td>{tx.category}</td><td>{tx.kind}</td><td className="text-right">{inr(tx.totalMinor)}</td><td className="space-x-2"><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => editTx(tx)}>Edit</button><button className="rounded-lg border border-[var(--ats-border)] px-2 py-1" type="button" onClick={() => removeTx(tx.id)}>Delete</button></td></tr>)}</tbody>
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

