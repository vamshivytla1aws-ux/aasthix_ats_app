"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { apiFetchJson } from "@/lib/apiClient";
import ModulePageFrame from "@/components/enterprise/ModulePageFrame";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
  ComposedChart,
} from "recharts";

type Tab = "dashboard" | "partners" | "partner_accounts" | "investments" | "company_account" | "direct_others" | "ledger" | "import_audit";
type Preset = "full" | "monthly" | "yearly" | "custom";

type Partner = { id: number; name: string; email: string | null; roleLabel: string | null; isActive: boolean };
type Tx = {
  id: number;
  txId?: string;
  kind: string;
  date: string;
  description: string;
  category: string;
  totalMinor: number;
  partnerId: number | null;
  accountEntryType: "debit" | "credit" | null;
  metadata?: Record<string, unknown>;
  createdAt?: string;
};
type LedgerEntry = {
  groupId: string;
  isGrouped: boolean;
  primaryTransactionId: number;
  txId: string;
  kind: string;
  date: string;
  description: string;
  category: string;
  totalMinor: number;
  currency: string;
  partnerId: number | null;
  accountEntryType: "debit" | "credit" | null;
  displayDirection: "debit" | "credit" | null;
  displayKindLabel: string;
  accountContext: string | null;
  linkedTransactions: Tx[];
};
type MePayload = {
  user?: { role?: string };
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
  const dmyDash = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyDash) return v;
  const dayMonYear = v.match(/^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})(?:\s+(\d{4}))?$/);
  if (dayMonYear) {
    const monthMap: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const mm = monthMap[dayMonYear[1].toLowerCase()];
    if (mm) {
      const dd = String(Number(dayMonYear[2])).padStart(2, "0");
      const yyyy = dayMonYear[3] ?? String(new Date().getFullYear());
      return `${dd}-${mm}-${yyyy}`;
    }
  }
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

function entrySortValue(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [message, setMessage] = useState("");
  const [partners, setPartners] = useState<Partner[]>([]);
  const [ledger, setLedger] = useState<Tx[]>([]);
  const [groupedLedger, setGroupedLedger] = useState<LedgerEntry[]>([]);
  const [batches, setBatches] = useState<Array<{ id: number; batchId: string; source: string; status: string; importedTransactions: number }>>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [me, setMe] = useState<MePayload | null>(null);

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
  const [expandedLedgerGroups, setExpandedLedgerGroups] = useState<string[]>([]);

  const [scenarioActive, setScenarioActive] = useState(false);
  const [scenarioInvestments, setScenarioInvestments] = useState<string>("");
  const [scenarioExpenses, setScenarioExpenses] = useState<string>("");

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
    
    let companyBalanceMinor = Number(dashboard?.companyAccountBalanceMinor ?? 0);
    
    if (scenarioActive) {
      companyBalanceMinor += (Number(scenarioInvestments) || 0) * 100;
      companyBalanceMinor -= (Number(scenarioExpenses) || 0) * 100;
    }

    const runwayMonths = avgMonthlyOutflowMinor > 0 ? companyBalanceMinor / avgMonthlyOutflowMinor : 0;
    return { avgMonthlyOutflowMinor, runwayMonths, companyBalanceMinor };
  }, [analytics, dashboard, scenarioActive, scenarioInvestments, scenarioExpenses]);
  const sortedGroupedLedger = useMemo(
    () =>
      [...groupedLedger].sort((a, b) => {
        const dateDiff = entrySortValue(b.date) - entrySortValue(a.date);
        if (dateDiff !== 0) return dateDiff;
        return b.primaryTransactionId - a.primaryTransactionId;
      }),
    [groupedLedger]
  );
  const sortedGroupedRecentLedger = useMemo(
    () =>
      [...(analytics?.groupedRecentLedger ?? [])].sort((a: any, b: any) => {
        const dateDiff = entrySortValue(b.date) - entrySortValue(a.date);
        if (dateDiff !== 0) return dateDiff;
        return Number(b.primaryTransactionId ?? 0) - Number(a.primaryTransactionId ?? 0);
      }),
    [analytics?.groupedRecentLedger]
  );
  const categoryAverages = useMemo(() => {
    const map = new Map<string, number>();
    const mix = analytics?.categorySpendMix ?? [];
    for (const c of mix) {
      if (c.amountMinor > 0) map.set(c.category, c.amountMinor / Math.max(1, (analytics?.monthlyInvestedVsExpenses?.length || 1)));
    }
    return map;
  }, [analytics]);

  const isAnomaly = (entry: any) => {
    if (entry.displayDirection !== "debit") return false;
    const avg = categoryAverages.get(entry.category);
    if (!avg || avg < 500000) return false; // Ignore small categories (under 5k INR)
    return entry.totalMinor > avg * 2.5; // Spikes > 2.5x the average monthly spend in that category
  };

  const isAdmin = String(me?.user?.role || "user").toLowerCase() === "admin";

  useEffect(() => {
    let active = true;
    apiFetchJson<MePayload>("/api/auth/me")
      .then((payload) => {
        if (active) setMe(payload);
      })
      .catch(() => {
        if (active) setMe(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function refreshBase() {
    const [workspace, p, tx, b] = await Promise.all([
      apiFetchJson<{ dashboard: any }>("/api/finance/workspace"),
      apiFetchJson<{ partners: Partner[] }>("/api/finance/partners"),
      apiFetchJson<{ transactions: Tx[]; groupedTransactions: LedgerEntry[] }>(
        `/api/finance/transactions?kind=${encodeURIComponent(kindFilter)}&q=${encodeURIComponent(search)}&sort=desc`
      ),
      apiFetchJson<{ batches: any[] }>("/api/finance/batches"),
    ]);
    setDashboard(workspace.dashboard);
    setPartners(p.partners ?? []);
    setLedger(tx.transactions ?? []);
    setGroupedLedger(tx.groupedTransactions ?? []);
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
    if (!editingTxId && activeKind === "partner_investment") {
      const source = await apiFetchJson<{ transaction?: { txId?: string } }>("/api/finance/transactions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await apiFetchJson("/api/finance/transactions", {
        method: "POST",
        body: JSON.stringify({
          kind: postToDirectOthers ? "direct_others_account_entry" : "company_account_entry",
          date: toApiDate(txDate),
          description: txDesc || `Partner investment mirrored to ${postToDirectOthers ? "direct/others" : "company account"}`,
          category: txCategory,
          amount: txAmount,
          accountEntryType: "credit",
          metadata: { linkedSource: "partner_investment", linkedSourceTxId: source?.transaction?.txId ?? null },
        }),
      });
    } else {
      await apiFetchJson("/api/finance/transactions", {
        method: editingTxId ? "PUT" : "POST",
        body: JSON.stringify(payload),
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

  function exportAccounting() {
    if (!ledger.length) return setMessage("No ledger data to export.");
    const header = "Date,Account,Description,Category,Debit,Credit\n";
    const rows = ledger.map((tx: any) => {
      const date = toDisplayDate(tx.date);
      const account = tx.kind === "company_account_entry" ? "Company Account" : (tx.kind === "direct_others_account_entry" ? "Direct/Others" : "Partner Investment");
      const desc = `"${(tx.description || "").replace(/"/g, '""')}"`;
      const cat = `"${(tx.category || "").replace(/"/g, '""')}"`;
      const amt = Number(tx.totalMinor) / 100;
      const isDebit = tx.accountEntryType === "debit" || (tx.kind === "partner_investment" && !tx.accountEntryType);
      const debit = isDebit ? amt : "";
      const credit = !isDebit ? amt : "";
      return `${date},"${account}",${desc},${cat},${debit},${credit}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finance-accounting-export-${todayDdMmYyyy()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("Accounting CSV exported successfully (QuickBooks/Tally format).");
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

  function editLedgerEntry(entry: LedgerEntry) {
    const primary = entry.linkedTransactions.find((tx) => tx.id === entry.primaryTransactionId) ?? entry.linkedTransactions[0];
    if (!primary) return;
    editTx(primary);
  }

  function toggleLedgerGroup(groupId: string) {
    setExpandedLedgerGroups((current) =>
      current.includes(groupId) ? current.filter((value) => value !== groupId) : [...current, groupId]
    );
  }

  const TABS: [Tab, string][] = [
    ["dashboard", "Dashboard"],
    ["partners", "Partners"],
    ["partner_accounts", "Partner Accounts"],
    ["investments", "Partner Investments"],
    ["company_account", "Company Account"],
    ["direct_others", "Direct/Others"],
    ["ledger", "Ledger"],
    ["import_audit", "Import & Audit"],
  ];

  return (
    <ModulePageFrame
      title="Finance"
      subtitle="Native ATS enterprise finance workspace (Postgres-backed)."
      toolbar={
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-1">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  tab === key
                    ? "bg-[var(--ats-primary)] text-[var(--ats-primary-foreground)]"
                    : "text-[var(--ats-text-muted)] hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-text)]"
                }`}
                onClick={() => setTab(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">Range</span>
            <select
              className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-[var(--ats-primary)]"
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value as Preset)}
            >
              <option value="full">Full</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom</option>
            </select>
            {rangePreset === "monthly" && (
              <input
                className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-[var(--ats-primary)]"
                value={rangeMonth}
                onChange={(e) => setRangeMonth(e.target.value)}
                placeholder="YYYY-MM"
              />
            )}
            {rangePreset === "yearly" && (
              <input
                className="w-24 rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-[var(--ats-primary)]"
                value={rangeYear}
                onChange={(e) => setRangeYear(e.target.value)}
                placeholder="YYYY"
              />
            )}
            {rangePreset === "custom" && (
              <>
                <input
                  className="w-32 rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-[var(--ats-primary)]"
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  placeholder="From dd-mm"
                />
                <input
                  className="w-32 rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] px-2 py-1.5 text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-[var(--ats-primary)]"
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  placeholder="To dd-mm"
                />
              </>
            )}
          </div>
        </div>
      }
    >
      {message && (
        <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-50/50 p-3 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          {message}
        </div>
      )}

      {tab === "dashboard" && (
        <div className="space-y-4">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">Account balance</p>
              <p className="mt-2 font-display text-3xl font-semibold text-[var(--ats-text)]">{inr(dashboard?.companyAccountBalanceMinor ?? 0)}</p>
              <p className="mt-1 text-xs font-medium text-[var(--ats-text-muted)]">As of: {dashboard?.accountBalanceAsOf ? toDisplayDate(dashboard.accountBalanceAsOf) : "-"}</p>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">This month inflow</p>
              <p className="mt-2 font-display text-3xl font-semibold text-[var(--ats-text)]">{inr(dashboard?.thisMonthInflowMinor ?? 0)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">This month outflow</p>
              <p className="mt-2 font-display text-3xl font-semibold text-[var(--ats-text)]">{inr(dashboard?.thisMonthOutflowMinor ?? 0)}</p>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">Total partners invested</p>
              <p className="mt-2 font-display text-3xl font-semibold text-[var(--ats-text)]">{inr(dashboard?.totalPartnerInvestedMinor ?? 0)}</p>
            </article>
          </section>

          <section className="rounded-2xl border border-[var(--ats-primary)] bg-[var(--ats-primary)]/10 p-5 shadow-sm">
            <h3 className="font-display text-2xl font-semibold text-[var(--ats-text)]">Cash Position Strip</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${scenarioActive ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-[var(--ats-primary)]/20 text-[var(--ats-primary)]"}`}>
                Runway: {Number.isFinite(cashStrip.runwayMonths) ? cashStrip.runwayMonths.toFixed(1) : "0.0"} months {scenarioActive ? "(Simulated)" : ""}
              </span>
              <span className="rounded-full bg-[var(--ats-primary)]/20 px-3 py-1 text-sm font-semibold text-[var(--ats-primary)]">
                Avg Monthly Outflow: {inr(cashStrip.avgMonthlyOutflowMinor)}
              </span>
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${scenarioActive ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-[var(--ats-primary)]/20 text-[var(--ats-primary)]"}`}>
                Est. Balance: {inr(cashStrip.companyBalanceMinor)} {scenarioActive ? "(Simulated)" : ""}
              </span>
            </div>
            
            <div className="mt-4 border-t border-[var(--ats-primary)]/20 pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--ats-text)]">What-If Scenario Modeling</h4>
                <button
                  type="button"
                  onClick={() => { setScenarioActive(!scenarioActive); setScenarioInvestments(""); setScenarioExpenses(""); }}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold ${scenarioActive ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400" : "bg-[var(--ats-bg-panel)] text-[var(--ats-text)] border border-[var(--ats-border)] hover:bg-[var(--ats-bg-subtle)]"}`}
                >
                  {scenarioActive ? "Reset / Disable" : "Enable Scratchpad"}
                </button>
              </div>
              {scenarioActive && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ats-text-muted)]">Hypothetical Investment (₹)</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-100"
                      placeholder="e.g. 500000"
                      value={scenarioInvestments}
                      onChange={(e) => setScenarioInvestments(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ats-text-muted)]">Upcoming Large Expense (₹)</label>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 outline-none focus:ring-2 focus:ring-amber-500 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-100"
                      placeholder="e.g. 200000"
                      value={scenarioExpenses}
                      onChange={(e) => setScenarioExpenses(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <h3 className="font-display text-xl font-semibold text-[var(--ats-text)] leading-tight">Monthly Invested vs Company Expenses</h3>
              <div className="mt-4 space-y-2">
                {(analytics?.monthlyInvestedVsExpenses ?? []).map((r: any) => (
                  <button key={r.month} type="button" onClick={() => applyLedgerDrill("partner_investment")} className="flex w-full items-center justify-between rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]">
                    <span>{String(r.month).slice(5, 7)}</span>
                    <div className="mx-3 h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--ats-bg-subtle)]">
                      <div className="h-full rounded-full bg-[var(--ats-primary)]" style={{ width: `${Math.max((Math.max(Number(r.investedMinor ?? 0), Number(r.expensesMinor ?? 0)) / maxMonthlyExpenseMinor) * 100, 4)}%` }} />
                    </div>
                    <span className="tabular-nums font-semibold">{inr(r.investedMinor)} <span className="font-normal text-[var(--ats-text-muted)]">/</span> {inr(r.expensesMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <h3 className="font-display text-xl font-semibold text-[var(--ats-text)] leading-tight">Partner Contribution Share</h3>
              <div className="mt-4">
                <input
                  className="w-full rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]"
                  value={(contributionTargetMinor / 100).toString()}
                  onChange={(e) => {
                    const amount = Number(e.target.value);
                    if (Number.isFinite(amount) && amount > 0) setContributionTargetMinor(Math.round(amount * 100));
                  }}
                  placeholder="Contribution target"
                />
                <p className="mt-2 text-xs font-medium text-[var(--ats-text-muted)]">100% is reached at <span className="font-semibold text-[var(--ats-text)]">{inr(contributionTargetMinor)}</span></p>
              </div>
              <div className="mt-4 space-y-2">
                {(analytics?.partnerContributionShare ?? []).map((r: any) => (
                  <button key={r.partnerId} type="button" onClick={() => { setSelectedPartnerId(r.partnerId); setTab("partner_accounts"); }} className="flex w-full items-center justify-between rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]">
                    <span>{r.partnerName}</span>
                    <span className="font-semibold">{Math.min(999, (Number(r.investedMinor ?? 0) / Math.max(contributionTargetMinor, 1)) * 100).toFixed(1)}%</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <h3 className="font-display text-xl font-semibold text-[var(--ats-text)] leading-tight">Equalization Gap by Partner</h3>
              <div className="mt-4 space-y-2">
                {(analytics?.equalizationGapByPartner ?? []).map((r: any) => (
                  <button key={r.partnerId} type="button" onClick={() => { setSelectedPartnerId(r.partnerId); setTab("partner_accounts"); }} className="flex w-full items-center justify-between rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]">
                    <span>{r.partnerName}</span>
                    <div className="mx-3 h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--ats-bg-subtle)]">
                      <div className="h-full rounded-full bg-[var(--ats-primary)]" style={{ width: `${Math.max((Math.abs(Number(r.deltaMinor ?? 0)) / maxEqualizationMinor) * 100, 4)}%` }} />
                    </div>
                    <span className="font-semibold">{inr(r.deltaMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
            <h3 className="font-display text-2xl font-semibold text-[var(--ats-text)]">Equalization Board</h3>
            <p className="mt-1 text-sm font-medium text-[var(--ats-text-muted)]">
              Total partner invested: <span className="font-semibold text-[var(--ats-text)]">{inr(Number(dashboard?.totalPartnerInvestedMinor ?? 0))}</span> · Active partners: <span className="font-semibold text-[var(--ats-text)]">{(dashboard?.equalization ?? []).length}</span> · Benchmark (highest invested): <span className="font-semibold text-[var(--ats-text)]">{inr(Math.max(...(dashboard?.equalization ?? []).map((r: any) => Number(r.investedMinor ?? 0)), 0))}</span>
            </p>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-[var(--ats-bg-elevated)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Partner</th>
                    <th className="px-4 py-3 text-right">Invested till now</th>
                    <th className="px-4 py-3 text-right">Delta to equal</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ats-border)]">
                  {(dashboard?.equalization ?? []).map((row: any) => (
                    <tr key={row.partnerId} className="transition-colors hover:bg-[var(--ats-bg-subtle)]">
                      <td className="px-4 py-3 font-semibold text-[var(--ats-text)]">{row.partnerName}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--ats-text)]">{inr(row.investedMinor)}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--ats-text)]">{inr(row.deltaToEqualMinor)}</td>
                      <td className="px-4 py-3 font-medium">
                        {Number(row.deltaToEqualMinor) > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400">Owes company {inr(row.deltaToEqualMinor)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">Benchmark matched</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
            <h3 className="font-display text-2xl font-semibold text-[var(--ats-text)]">Splitwise Member Totals</h3>
            <div className="mt-4 overflow-x-auto rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-[var(--ats-bg-elevated)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3 text-right">Paid</th>
                    <th className="px-4 py-3 text-right">Share/Owes</th>
                    <th className="px-4 py-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ats-border)]">
                  {Object.entries(dashboard?.splitwiseSummary?.memberTotals ?? {}).map(([member, totals]: any) => (
                    <tr key={member} className="transition-colors hover:bg-[var(--ats-bg-subtle)]">
                      <td className="px-4 py-3 font-semibold text-[var(--ats-text)]">{member}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--ats-text)]">{inr(totals.paidCents)}</td>
                      <td className="px-4 py-3 text-right font-medium text-[var(--ats-text)]">{inr(totals.shareCents)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--ats-text)]">{inr(totals.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] font-semibold text-[var(--ats-text)]">
                  <tr>
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">{inr(Number(dashboard?.splitwiseSummary?.totalPaidCents ?? 0))}</td>
                    <td className="px-4 py-3 text-right">{inr(Number(dashboard?.splitwiseSummary?.totalShareCents ?? 0))}</td>
                    <td className="px-4 py-3 text-right">{inr(Number(dashboard?.splitwiseSummary?.totalBalanceCents ?? 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <h3 className="font-display text-xl font-semibold text-[var(--ats-text)]">Category spend mix</h3>
              <div className="mt-4 space-y-2">
                {(analytics?.categorySpendMix ?? []).map((r: any) => (
                  <button key={r.category} type="button" onClick={() => { setKindFilter("company_expense"); setSearch(r.category); setTab("ledger"); }} className="flex w-full items-center justify-between rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]">
                    <span className="text-[var(--ats-text)]">{r.category}</span>
                    <span className="font-semibold text-[var(--ats-text)]">{inr(r.amountMinor)}</span>
                  </button>
                ))}
              </div>
            </article>
            <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
              <h3 className="font-display text-xl font-semibold text-[var(--ats-text)]">Recent ledger</h3>
              <div className="mt-4 space-y-2">
                {sortedGroupedRecentLedger.map((r: any) => {
                  const anomaly = isAnomaly(r);
                  return (
                    <button key={`${r.groupId}-${r.date}`} type="button" onClick={() => { setSearch(r.description); setTab("ledger"); }} className={`flex w-full items-center justify-between rounded-lg border ${anomaly ? "border-rose-300 bg-rose-50 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10" : "border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] hover:bg-[var(--ats-bg-subtle)]"} px-3 py-2 text-left text-sm transition-colors hover:text-[var(--ats-primary)]`}>
                      <span className="truncate pr-4 font-medium text-[var(--ats-text)]">
                        <span className="text-[var(--ats-text-muted)]">{toDisplayDate(r.date)}</span> <span className="mx-1 text-[var(--ats-border-strong)]">|</span> {r.description}
                        {r.displayKindLabel ? <span className={`ml-2 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${anomaly ? "border-rose-400 bg-rose-100 text-rose-700 dark:border-rose-500/50 dark:bg-rose-500/20 dark:text-rose-300" : "border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] text-[var(--ats-text-muted)]"}`}>{r.displayKindLabel}</span> : ""}
                        {anomaly && <span className="ml-2 inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">Unusual Spike</span>}
                      </span>
                      <span className={`shrink-0 font-semibold ${anomaly ? "text-rose-700 dark:text-rose-400" : "text-[var(--ats-text)]"}`}>{inr(r.totalMinor)}</span>
                    </button>
                  );
                })}
              </div>
            </article>
          </section>
        </div>
      )}

      {tab === "partner_accounts" && (
        <section className="space-y-4 rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ats-border)] pb-4">
            <select className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" value={selectedPartnerId || ""} onChange={(e) => setSelectedPartnerId(Number(e.target.value))}>
              <option value="">Select partner</option>
              {partners.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--ats-bg-subtle)] disabled:opacity-50" onClick={() => openPartnerExport("csv")} disabled={!selectedPartnerId}>Export CSV</button>
            <button type="button" className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium transition-colors hover:bg-[var(--ats-bg-subtle)] disabled:opacity-50" onClick={() => openPartnerExport("pdf")} disabled={!selectedPartnerId}>Export PDF</button>
          </div>
          {!partnerStatement ? <p className="py-4 text-center text-sm font-medium text-[var(--ats-text-muted)]">Select a partner to view statement.</p> : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] p-3"><div className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">Invested</div><div className="mt-1 font-display text-xl font-semibold text-[var(--ats-text)]">{inr(partnerStatement.totalInvestedMinor)}</div></div>
                <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] p-3"><div className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">Debit</div><div className="mt-1 font-display text-xl font-semibold text-[var(--ats-text)]">{inr(partnerStatement.totalDebitMinor)}</div></div>
                <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] p-3"><div className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-text-muted)]">Credit</div><div className="mt-1 font-display text-xl font-semibold text-[var(--ats-text)]">{inr(partnerStatement.totalCreditMinor)}</div></div>
                <div className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-primary)]/10 p-3"><div className="text-xs font-semibold uppercase tracking-wider text-[var(--ats-primary)]">Net</div><div className="mt-1 font-display text-xl font-semibold text-[var(--ats-primary)]">{inr(partnerStatement.netMinor)}</div></div>
              </div>
              <div className="overflow-x-auto rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-[var(--ats-bg-elevated)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Narration</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3 text-right">Invested</th>
                      <th className="px-4 py-3 text-right">Running</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--ats-border)]">
                    {(partnerStatement.rows ?? []).map((row: any) => (
                      <tr className="transition-colors hover:bg-[var(--ats-bg-subtle)]" key={row.txId}>
                        <td className="px-4 py-3 font-medium text-[var(--ats-text)]">{toDisplayDate(row.date)}</td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{row.narration}</td>
                        <td className="px-4 py-3"><span className="inline-flex rounded-md bg-[var(--ats-bg-subtle)] px-2 py-1 text-xs font-medium text-[var(--ats-text-muted)]">{row.category}</span></td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--ats-text)]">{inr(row.investedMinor)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-[var(--ats-text)]">{inr(row.runningBalanceMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "partners" && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
            <h3 className="mb-4 font-display text-xl font-semibold text-[var(--ats-text)]">Add Partner</h3>
            <form className="space-y-3" onSubmit={addPartner}>
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Name" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Email" value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Role label" value={partnerRole} onChange={(e) => setPartnerRole(e.target.value)} />
              <button className="w-full rounded-xl bg-[var(--ats-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--ats-primary-foreground)] shadow-sm transition-opacity hover:opacity-90" type="submit">Save partner</button>
            </form>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] shadow-sm lg:col-span-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ats-border)]">
                  {partners.map((p) => (
                    <tr className="transition-colors hover:bg-[var(--ats-bg-subtle)]" key={p.id}>
                      <td className="px-4 py-3 font-semibold text-[var(--ats-text)]">{p.name}</td>
                      <td className="px-4 py-3 text-[var(--ats-text)]">{p.email ?? "-"}</td>
                      <td className="px-4 py-3 text-[var(--ats-text-muted)]">{p.roleLabel ?? "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${p.isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-[var(--ats-bg-subtle)] text-[var(--ats-text-muted)]'}`}>
                          {p.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]" type="button" onClick={() => togglePartner(p)}>
                          {p.isActive ? "Deactivate" : "Reactivate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {(tab === "investments" || tab === "company_account" || tab === "direct_others") && (
        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
            <h3 className="mb-4 font-display text-xl font-semibold text-[var(--ats-text)]">
              {tab === "investments" ? "Add Investment" : tab === "company_account" ? "Add Company Entry" : "Add Direct/Others Entry"}
            </h3>
            <form className="space-y-3" onSubmit={saveTx}>
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" value={txDate} onChange={(e) => setTxDate(e.target.value)} placeholder="dd-mm-yyyy" />
              {tab === "investments" ? (
                <select className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" value={txPartnerId} onChange={(e) => setTxPartnerId(e.target.value)}>
                  <option value="">Select partner</option>
                  {partners.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <select className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" value={txAccountType} onChange={(e) => setTxAccountType(e.target.value as "debit" | "credit")}>
                  <option value="debit">Debit</option><option value="credit">Credit</option>
                </select>
              )}
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Description" value={txDesc} onChange={(e) => setTxDesc(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Category" value={txCategory} onChange={(e) => setTxCategory(e.target.value)} />
              <input className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Amount" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
              {tab === "investments" ? (
                <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ats-text)]">
                  <input type="checkbox" className="rounded border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] text-[var(--ats-primary)] focus:ring-[var(--ats-primary)]" checked={postToDirectOthers} onChange={(e) => setPostToDirectOthers(e.target.checked)} />
                  Post to Direct/Others account (credit)
                </label>
              ) : null}
              <button className="w-full rounded-xl bg-[var(--ats-primary)] px-3 py-2.5 text-sm font-semibold text-[var(--ats-primary-foreground)] shadow-sm transition-opacity hover:opacity-90" type="submit">{editingTxId ? "Update entry" : "Save entry"}</button>
              {editingTxId ? <button className="w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2.5 text-sm font-semibold text-[var(--ats-text)] transition-colors hover:bg-[var(--ats-bg-subtle)]" type="button" onClick={() => { setEditingTxId(null); setTxDate(todayDdMmYyyy()); setTxDesc(""); setTxCategory("General"); setTxAmount(""); setTxPartnerId(""); setTxAccountType("debit"); setPostToDirectOthers(false); }}>Cancel edit</button> : null}
            </form>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] shadow-sm lg:col-span-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Partner</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ats-border)]">
                  {ledger.filter((tx) => (tab === "investments" ? tx.kind === "partner_investment" || tx.kind === "expense" : tab === "direct_others" ? tx.kind === "direct_others_account_entry" : tx.kind === "company_account_entry")).map((tx) => (
                    <tr className="transition-colors hover:bg-[var(--ats-bg-subtle)]" key={tx.id}>
                      <td className="px-4 py-3 font-medium text-[var(--ats-text)]">{toDisplayDate(tx.date)}</td>
                      <td className="px-4 py-3 text-[var(--ats-text)]">{tx.description}</td>
                      <td className="px-4 py-3 text-[var(--ats-text)]">{tx.partnerId ? partnerById.get(tx.partnerId)?.name ?? "-" : "-"}</td>
                      <td className="px-4 py-3"><span className="inline-flex rounded bg-[var(--ats-bg-subtle)] px-2 py-1 text-xs font-medium text-[var(--ats-text-muted)]">{tx.accountEntryType ?? tx.kind}</span></td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--ats-text)]">{inr(tx.totalMinor)}</td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <button className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]" type="button" onClick={() => editTx(tx)}>Edit</button>
                        <button className="rounded-lg border border-red-500/20 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20" type="button" onClick={() => removeTx(tx.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}

      {tab === "ledger" && (
        <section className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-3 border-b border-[var(--ats-border)] pb-4">
            <input className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-[var(--ats-primary)]" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}>
              <option value="all">All</option><option value="partner_investment">Partner investment</option><option value="company_expense">Company expense</option><option value="company_inflow">Company inflow</option><option value="company_account_entry">Company account</option><option value="direct_others_account_entry">Direct/Others account</option><option value="expense">Imported expense</option>
            </select>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-[var(--ats-bg-elevated)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ats-border)]">
                {sortedGroupedLedger.map((entry) => {
                  const isExpanded = expandedLedgerGroups.includes(entry.groupId);
                  return (
                    <Fragment key={entry.groupId}>
                      <tr className="transition-colors hover:bg-[var(--ats-bg-subtle)]">
                        <td className="px-4 py-3 font-medium text-[var(--ats-text)]">{toDisplayDate(entry.date)}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[var(--ats-text)]">{entry.description}</div>
                          {entry.isGrouped ? <div className="mt-1 text-xs font-medium text-[var(--ats-text-muted)]">{entry.linkedTransactions.length} linked accounting rows</div> : null}
                        </td>
                        <td className="px-4 py-3"><span className="inline-flex rounded-md bg-[var(--ats-bg-subtle)] px-2 py-1 text-xs font-medium text-[var(--ats-text-muted)]">{entry.category}</span></td>
                        <td className="px-4 py-3"><span className="inline-flex rounded-md border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-2 py-1 text-xs font-medium text-[var(--ats-text)]">{entry.displayKindLabel}</span></td>
                        <td className="px-4 py-3 text-[var(--ats-text)]">{entry.accountContext ?? "-"}</td>
                        <td className="px-4 py-3 text-right font-display text-[15px] font-bold text-[var(--ats-text)]">{inr(entry.totalMinor)}</td>
                        <td className="px-4 py-3 text-right space-x-2">
                          {isAdmin && entry.isGrouped ? (
                            <button className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--ats-bg-subtle)]" type="button" onClick={() => toggleLedgerGroup(entry.groupId)}>
                              {isExpanded ? "Hide detail" : "Show detail"}
                            </button>
                          ) : null}
                          <button className="rounded-lg border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--ats-bg-subtle)] hover:text-[var(--ats-primary)]" type="button" onClick={() => editLedgerEntry(entry)}>Edit</button>
                          <button className="rounded-lg border border-red-500/20 bg-red-50/50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20" type="button" onClick={() => removeTx(entry.primaryTransactionId)}>Delete</button>
                        </td>
                      </tr>
                      {isAdmin && entry.isGrouped && isExpanded ? (
                        <tr className="bg-[var(--ats-bg-subtle)]/50" key={`${entry.groupId}-detail`}>
                          <td colSpan={7} className="px-4 py-4">
                            <div className="text-xs font-bold uppercase tracking-wider text-[var(--ats-text-muted)]">Raw accounting rows</div>
                            <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-[var(--ats-bg-elevated)]">
                              <table className="min-w-full text-left text-xs">
                                <thead className="bg-[var(--ats-bg-subtle)] uppercase tracking-wide text-[var(--ats-text-muted)]">
                                  <tr>
                                    <th className="px-3 py-2">Kind</th>
                                    <th className="px-3 py-2">Entry Type</th>
                                    <th className="px-3 py-2">Description</th>
                                    <th className="px-3 py-2">Account</th>
                                    <th className="px-3 py-2 text-right">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--ats-border)]">
                                  {entry.linkedTransactions.map((tx) => (
                                    <tr className="transition-colors hover:bg-[var(--ats-bg-subtle)]" key={`${entry.groupId}-${tx.id}`}>
                                      <td className="px-3 py-2 font-medium text-[var(--ats-text)]">{tx.kind}</td>
                                      <td className="px-3 py-2 text-[var(--ats-text-muted)]">{tx.accountEntryType ?? "-"}</td>
                                      <td className="px-3 py-2 text-[var(--ats-text)]">{tx.description}</td>
                                      <td className="px-3 py-2 text-[var(--ats-text)]">
                                        {tx.kind === "company_account_entry"
                                          ? "Company Account"
                                          : tx.kind === "direct_others_account_entry"
                                            ? "Direct/Others Account"
                                            : tx.kind === "partner_investment"
                                              ? "Partner Investment"
                                              : "-"}
                                      </td>
                                      <td className="px-3 py-2 text-right font-semibold text-[var(--ats-text)]">{inr(tx.totalMinor)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "import_audit" && (
        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
            <h3 className="font-display text-xl font-semibold text-[var(--ats-text)]">Backup & Restore</h3>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="rounded-xl bg-[var(--ats-primary)] px-4 py-2 text-sm font-semibold text-[var(--ats-primary-foreground)] shadow-sm transition-opacity hover:opacity-90" type="button" onClick={exportBackup}>Export Finance Backup</button>
              <button className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 dark:bg-teal-500" type="button" onClick={exportAccounting}>Export Accounting CSV</button>
              <button className="rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--ats-text)] shadow-sm transition-colors hover:bg-[var(--ats-bg-subtle)]" type="button" onClick={triggerBackupImportPicker}>
                Import JSON Backup
              </button>
              <label className="cursor-pointer rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--ats-text)] shadow-sm transition-colors hover:bg-[var(--ats-bg-subtle)]">
                Select backup file
                <input ref={backupImportInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleRestoreFile} />
              </label>
            </div>
            {restorePreview ? (
              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-50/50 p-4 shadow-sm dark:bg-amber-500/10">
                <p className="font-display text-lg font-semibold text-amber-900 dark:text-amber-400">Restore Preview</p>
                <div className="mt-3 grid gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                  <div className="flex justify-between"><span className="text-amber-700/70 dark:text-amber-400/70">Workspace:</span> <span>{restorePreview.workspaceName}</span></div>
                  <div className="flex justify-between"><span className="text-amber-700/70 dark:text-amber-400/70">Partners:</span> <span>{restorePreview.partnerCount}</span></div>
                  <div className="flex justify-between"><span className="text-amber-700/70 dark:text-amber-400/70">Transactions:</span> <span>{restorePreview.transactionCount}</span></div>
                  <div className="flex justify-between"><span className="text-amber-700/70 dark:text-amber-400/70">Invested:</span> <span className="font-semibold">{inr(restorePreview.totalInvestedMinor)}</span></div>
                  <div className="flex justify-between"><span className="text-amber-700/70 dark:text-amber-400/70">Expenses:</span> <span className="font-semibold">{inr(restorePreview.totalCompanyExpensesMinor)}</span></div>
                </div>
                {restorePreview.warnings?.length ? (
                  <div className="mt-4 rounded-lg bg-amber-500/20 p-2 text-xs text-amber-900 dark:text-amber-300">
                    <span className="font-bold">Warnings:</span> {restorePreview.warnings.join(" | ")}
                  </div>
                ) : null}
                <div className="mt-5">
                  <button className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-opacity hover:opacity-90" type="button" onClick={applyRestore}>
                    Confirm restore (DANGER: Replaces entire workspace)
                  </button>
                </div>
              </div>
            ) : null}
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm">
            <h3 className="font-display text-xl font-semibold text-[var(--ats-text)]">Import Groups-Split-Web Snapshot</h3>
            <div className="mt-4">
              <label className="inline-flex cursor-pointer rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-elevated)] px-4 py-2 text-sm font-semibold text-[var(--ats-text)] shadow-sm transition-colors hover:bg-[var(--ats-bg-subtle)]">
                Select snapshot file
                <input type="file" accept="application/json,.json" className="hidden" onChange={handleSnapshotFile} />
              </label>
            </div>
            <textarea className="mt-4 min-h-[220px] w-full rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-subtle)] p-3 text-sm font-mono text-[var(--ats-text)] outline-none focus:border-[var(--ats-primary)] focus:ring-1 focus:ring-[var(--ats-primary)]" placeholder='{"transactions":[...]}' value={snapshotText} onChange={(e) => setSnapshotText(e.target.value)} />
            <button className="mt-4 w-full rounded-xl bg-[var(--ats-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--ats-primary-foreground)] shadow-sm transition-opacity hover:opacity-90" type="button" onClick={importSnapshot}>Import Snapshot</button>
          </article>
          <article className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-5 shadow-sm lg:col-span-2 overflow-hidden">
            <h3 className="mb-4 font-display text-xl font-semibold text-[var(--ats-text)]">Import Batch Audit</h3>
            <div className="overflow-x-auto rounded-xl border border-[var(--ats-border)] bg-white shadow-sm dark:bg-[var(--ats-bg-elevated)]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[var(--ats-bg-subtle)] text-xs uppercase tracking-wide text-[var(--ats-text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Batch</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Imported</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ats-border)]">
                  {batches.map((b) => (
                    <tr className="transition-colors hover:bg-[var(--ats-bg-subtle)]" key={b.id}>
                      <td className="px-4 py-3 font-medium text-[var(--ats-text)]">{b.batchId}</td>
                      <td className="px-4 py-3 text-[var(--ats-text)]">{b.source}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-[var(--ats-bg-subtle)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[var(--ats-text-muted)]">{b.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[var(--ats-text)]">{b.importedTransactions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      )}
    </ModulePageFrame>
  );
}
