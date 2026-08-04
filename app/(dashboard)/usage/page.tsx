"use client";

import React, { useMemo, useState } from"react";
import useSWR from"swr";
import { Calendar, RefreshCw } from"lucide-react";
import AccessGate from"@/components/AccessGate";
import ModuleDataTable, { type ModuleDataTableColumn } from"@/components/enterprise/ModuleDataTable";
import ModulePageFrame from"@/components/enterprise/ModulePageFrame";
import UsageStatusBadge from"@/components/usage/UsageStatusBadge";
import { dashboardFetcher } from"@/lib/swrFetcher";
import { UI } from"@/lib/ui";
import { formatDateOnly, formatDateTime, formatInteger, formatPercent, formatTokenCount, formatUsd } from"@/lib/usage/format";
import type { OpenAiUsageResponse, OpenAiUsageRow, RailwayUsageResponse, RailwayUsageRow, UsageSummaryResponse } from"@/lib/usage/types";
import { DatePicker } from"@/components/ui/DateTimeFields";

type TabKey ="openai" |"railway";
type Preset ="today" |"last7" |"thisMonth" |"custom";

function UsageMetricCard({
 label,
 value,
 note,
}: {
 label: string;
 value: string;
 note?: string;
}) {
 return (
 <div className={UI.enterprise.metricCard +" min-w-[180px] p-4"}>
 <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ats-text-soft)]">{label}</div>
 <div className="mt-2 text-xl font-semibold text-[var(--ats-text)]">{value}</div>
 {note ? <div className="mt-1 text-xs text-[var(--ats-text-muted)]">{note}</div> : null}
 </div>
 );
}

function buildQuery(preset: Preset, from: string, to: string, refreshTick: number) {
 const params = new URLSearchParams();
 params.set("preset", preset);
 if (preset ==="custom") {
 if (from) params.set("start", new Date(from).toISOString());
 if (to) {
 const end = new Date(to);
 end.setHours(23, 59, 59, 999);
 params.set("end", end.toISOString());
 }
 }
 if (refreshTick > 0) params.set("refresh","1");
 return params.toString();
}

export default function AiUsagePage() {
 const [tab, setTab] = useState<TabKey>("openai");
 const [preset, setPreset] = useState<Preset>("thisMonth");
 const [from, setFrom] = useState("");
 const [to, setTo] = useState("");
 const [refreshTick, setRefreshTick] = useState(0);

 const qs = useMemo(() => buildQuery(preset, from, to, refreshTick), [preset, from, to, refreshTick]);

 const summary = useSWR<UsageSummaryResponse>(`/api/usage/summary${refreshTick > 0 ?"?refresh=1" :""}`, dashboardFetcher, {
 refreshInterval: 300_000,
 revalidateOnFocus: false,
 });

 const openai = useSWR<OpenAiUsageResponse>(`/api/usage/openai?${qs}`, dashboardFetcher, {
 refreshInterval: tab ==="openai" ? 300_000 : 0,
 revalidateOnFocus: false,
 });
 const railway = useSWR<RailwayUsageResponse>(`/api/usage/railway?${qs}`, dashboardFetcher, {
 refreshInterval: tab ==="railway" ? 300_000 : 0,
 revalidateOnFocus: false,
 });

 const manualRefresh = () => {
 setRefreshTick((value) => value + 1);
 void summary.mutate();
 void openai.mutate();
 void railway.mutate();
 };

 return (
 <AccessGate permissionKey="dashboard.view">
 <ModulePageFrame
 title="AI Usage"
 subtitle="Monitor OpenAI API usage and Railway project usage from the same enterprise workspace."
 metrics={
 summary.data ? (
 <div className="flex flex-wrap items-center gap-2">
 <span className="text-sm text-[var(--ats-text-muted)]">OpenAI</span>
 <UsageStatusBadge status={summary.data.openai.status} />
 <span className="text-sm text-[var(--ats-text-muted)]">Railway</span>
 <UsageStatusBadge status={summary.data.railway.status} />
 </div>
 ) : (
 <span className="text-sm text-[var(--ats-text-muted)]">Usage summary will appear here after the first sync.</span>
 )
 }
 actions={
 <div className="flex flex-wrap items-center gap-2">
 <DateFilter preset={preset} setPreset={setPreset} from={from} setFrom={setFrom} to={to} setTo={setTo} />
 <button type="button" onClick={manualRefresh} className={UI.secondaryButton +" py-2 text-xs"}>
 <RefreshCw className="h-3.5 w-3.5" />
 Refresh
 </button>
 </div>
 }
 banner={<QuickSummary summary={summary.data} loading={summary.isLoading} />}
 >
 <div className="mb-4 flex flex-wrap items-center gap-1 rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-1 shadow-sm">
 {[
 { id:"openai", label:"OpenAI" },
 { id:"railway", label:"Railway" },
 ].map((item) => (
 <button
 key={item.id}
 type="button"
 onClick={() => setTab(item.id as TabKey)}
 className={[
"rounded-lg px-4 py-2 text-xs font-semibold transition",
 tab === item.id
 ?"bg-[var(--ats-primary)] text-[var(--ats-primary-foreground)] shadow-sm"
 :"text-[var(--ats-text-muted)] hover:bg-[var(--ats-bg-subtle)] dark:hover:bg-slate-800",
 ].join("")}
 >
 {item.label}
 </button>
 ))}
 </div>

 {tab ==="openai" ? <OpenAiTab data={openai.data} loading={openai.isLoading} onRetry={manualRefresh} /> : null}
 {tab ==="railway" ? <RailwayTab data={railway.data} loading={railway.isLoading} onRetry={manualRefresh} /> : null}
 </ModulePageFrame>
 </AccessGate>
 );
}

function QuickSummary({ summary, loading }: { summary?: UsageSummaryResponse; loading: boolean }) {
 if (loading && !summary) {
 return <div className="text-sm text-[var(--ats-text-muted)]">Syncing provider usage…</div>;
 }

 if (!summary) {
 return <div className="text-sm text-[var(--ats-text-muted)]">Usage summary is unavailable right now.</div>;
 }

 return (
 <div className="grid gap-3 md:grid-cols-2">
 <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
 <div className="flex items-center justify-between gap-2">
 <div className="text-sm font-semibold text-[var(--ats-text)]">OpenAI quick view</div>
 <UsageStatusBadge status={summary.openai.status} />
 </div>
 <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--ats-text-muted)]">
 <div>Spend: <span className="font-semibold text-[var(--ats-text)]">{formatUsd(summary.openai.current_month_spend_usd)}</span></div>
 <div>Remaining: <span className="font-semibold text-[var(--ats-text)]">{formatUsd(summary.openai.remaining_budget_usd)}</span></div>
 <div>Requests: <span className="font-semibold text-[var(--ats-text)]">{formatInteger(summary.openai.current_month_totals.requests)}</span></div>
 <div>Usage: <span className="font-semibold text-[var(--ats-text)]">{formatPercent(summary.openai.usage_percent)}</span></div>
 </div>
 </div>
 <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
 <div className="flex items-center justify-between gap-2">
 <div className="text-sm font-semibold text-[var(--ats-text)]">Railway quick view</div>
 <UsageStatusBadge status={summary.railway.status} />
 </div>
 <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--ats-text-muted)]">
 <div>Plan: <span className="font-semibold text-[var(--ats-text)]">{summary.railway.current_plan ||"—"}</span></div>
 <div>Current: <span className="font-semibold text-[var(--ats-text)]">{formatUsd(summary.railway.current_usage_usd)}</span></div>
 <div>Estimated: <span className="font-semibold text-[var(--ats-text)]">{formatUsd(summary.railway.estimated_usage_usd)}</span></div>
 <div>Remaining: <span className="font-semibold text-[var(--ats-text)]">{formatUsd(summary.railway.remaining_quota_usd)}</span></div>
 </div>
 </div>
 </div>
 );
}

function OpenAiTab({
 data,
 loading,
 onRetry,
}: {
 data?: OpenAiUsageResponse;
 loading: boolean;
 onRetry: () => void;
}) {
 const columns = useMemo<ModuleDataTableColumn<OpenAiUsageRow>[]>(() => [
 { id:"date", header:"Date", defaultWidth: 118, csvValue: (row) => row.date, cell: (row) => formatDateOnly(row.date), sortValue: (row) => row.date },
 { id:"model", header:"Model", defaultWidth: 140, csvValue: (row) => row.model, cell: (row) => row.model, sortValue: (row) => row.model },
 { id:"requests", header:"Requests", defaultWidth: 110, csvValue: (row) => String(row.requests), cell: (row) => formatInteger(row.requests), sortValue: (row) => row.requests, align:"right" },
 { id:"input", header:"Input Tokens", defaultWidth: 120, csvValue: (row) => String(row.input_tokens), cell: (row) => formatTokenCount(row.input_tokens), sortValue: (row) => row.input_tokens, align:"right" },
 { id:"output", header:"Output Tokens", defaultWidth: 120, csvValue: (row) => String(row.output_tokens), cell: (row) => formatTokenCount(row.output_tokens), sortValue: (row) => row.output_tokens, align:"right" },
 { id:"total", header:"Total Tokens", defaultWidth: 120, csvValue: (row) => String(row.total_tokens), cell: (row) => formatTokenCount(row.total_tokens), sortValue: (row) => row.total_tokens, align:"right" },
 { id:"cost", header:"Cost", defaultWidth: 110, csvValue: (row) => String(row.cost_usd ??""), cell: (row) => formatUsd(row.cost_usd), sortValue: (row) => row.cost_usd ?? -1, align:"right" },
 { id:"budget", header:"Budget Limit", defaultWidth: 120, csvValue: (row) => String(row.budget_limit_usd ??""), cell: (row) => formatUsd(row.budget_limit_usd), sortValue: (row) => row.budget_limit_usd ?? -1, align:"right" },
 { id:"remaining", header:"Remaining Budget", defaultWidth: 130, csvValue: (row) => String(row.remaining_budget_usd ??""), cell: (row) => formatUsd(row.remaining_budget_usd), sortValue: (row) => row.remaining_budget_usd ?? -1, align:"right" },
 { id:"source", header:"Source", defaultWidth: 150, csvValue: (row) => row.source, cell: (row) => row.source, sortValue: (row) => row.source },
 { id:"status", header:"Status", defaultWidth: 120, csvValue: (row) => row.status, cell: (row) => <UsageStatusBadge status={row.status} />, sortValue: (row) => row.status },
 ], []);

 if (loading && !data) return <SkeletonState rows={6} />;

 if (!data) return <ErrorState title="Unable to load OpenAI usage" message="No response was returned from the usage API." onRetry={onRetry} />;
 if (data.error && data.rows.length === 0) {
 return <ErrorState title="Unable to load OpenAI usage" message={data.error} onRetry={onRetry} />;
 }

 return (
 <div className="space-y-5">
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
 <UsageMetricCard label="Budget Limit" value={formatUsd(data.monthly_budget_limit_usd)} note={data.monthly_budget_limit_source} />
 <UsageMetricCard label="Current Spend" value={formatUsd(data.current_month_spend_usd)} note={data.current_month_spend_source} />
 <UsageMetricCard label="Remaining Budget" value={formatUsd(data.remaining_budget_usd)} note={data.remaining_budget_source} />
 <UsageMetricCard label="Total Requests" value={formatInteger(data.selected_totals.requests)} note="Selected range" />
 <UsageMetricCard label="Input Tokens" value={formatTokenCount(data.selected_totals.input_tokens)} note="Selected range" />
 <UsageMetricCard label="Output Tokens" value={formatTokenCount(data.selected_totals.output_tokens)} note="Selected range" />
 <UsageMetricCard label="Total Tokens" value={formatTokenCount(data.selected_totals.total_tokens)} note={data.monthly_token_limit_source} />
 <UsageMetricCard label="Last Updated" value={formatDateTime(data.last_synced_at)} note={`Status: ${data.status}`} />
 </div>

 <SourceNotes title="OpenAI source notes" notes={data.data_source.notes} />

 <ModuleDataTable
 rows={data.rows}
 rowKey={(row) => `${row.date}-${row.model}`}
 columns={columns}
 storageKey="usage_openai_table_v1"
 exportBasename="openai-usage"
 density="compact"
 emptyMessage="No OpenAI usage rows found for this date range."
 maxBodyHeight="min(66vh, 760px)"
 />
 </div>
 );
}

function RailwayTab({
 data,
 loading,
 onRetry,
}: {
 data?: RailwayUsageResponse;
 loading: boolean;
 onRetry: () => void;
}) {
 const columns = useMemo<ModuleDataTableColumn<RailwayUsageRow>[]>(() => [
 { id:"date", header:"Date", defaultWidth: 118, csvValue: (row) => row.date, cell: (row) => formatDateOnly(row.date), sortValue: (row) => row.date },
 { id:"scope", header:"Workspace / Project / Service", defaultWidth: 220, csvValue: (row) => row.scope, cell: (row) => row.scope, sortValue: (row) => row.scope },
 { id:"metric", header:"Metric Type", defaultWidth: 140, csvValue: (row) => row.metric_type, cell: (row) => row.metric_type, sortValue: (row) => row.metric_type },
 {
 id:"usage",
 header:"Usage",
 defaultWidth: 120,
 csvValue: (row) => `${row.usage_value ??""} ${row.usage_unit ??""}`.trim(),
 cell: (row) => `${formatInteger(row.usage_value)}${row.usage_unit ? ` ${row.usage_unit}` :""}`,
 sortValue: (row) => row.usage_value ?? -1,
 align:"right",
 },
 {
 id:"estimated",
 header:"Estimated Usage",
 defaultWidth: 140,
 csvValue: (row) => `${row.estimated_usage_value ??""} ${row.usage_unit ??""}`.trim(),
 cell: (row) => `${formatInteger(row.estimated_usage_value)}${row.usage_unit ? ` ${row.usage_unit}` :""}`,
 sortValue: (row) => row.estimated_usage_value ?? -1,
 align:"right",
 },
 { id:"limit", header:"Limit", defaultWidth: 110, csvValue: (row) => String(row.limit_value ??""), cell: (row) => formatUsd(row.limit_value), sortValue: (row) => row.limit_value ?? -1, align:"right" },
 { id:"remaining", header:"Remaining", defaultWidth: 110, csvValue: (row) => String(row.remaining_value ??""), cell: (row) => formatUsd(row.remaining_value), sortValue: (row) => row.remaining_value ?? -1, align:"right" },
 { id:"billing", header:"Billing Period", defaultWidth: 160, csvValue: (row) => row.billing_period, cell: (row) => row.billing_period, sortValue: (row) => row.billing_period },
 { id:"source", header:"Source", defaultWidth: 150, csvValue: (row) => row.source, cell: (row) => row.source, sortValue: (row) => row.source },
 { id:"status", header:"Status", defaultWidth: 120, csvValue: (row) => row.status, cell: (row) => <UsageStatusBadge status={row.status} />, sortValue: (row) => row.status },
 ], []);

 if (loading && !data) return <SkeletonState rows={6} />;
 if (!data) return <ErrorState title="Unable to load Railway usage" message="No response was returned from the usage API." onRetry={onRetry} />;
 if (data.error && data.rows.length === 0) {
 return <ErrorState title="Unable to load Railway usage" message={data.error} onRetry={onRetry} />;
 }

 return (
 <div className="space-y-5">
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
 <UsageMetricCard label="Current Plan" value={data.current_plan ||"—"} note={data.current_plan_source} />
 <UsageMetricCard label="Current Usage" value={formatUsd(data.current_usage_usd)} note={data.current_usage_source} />
 <UsageMetricCard label="Estimated Usage" value={formatUsd(data.estimated_usage_usd)} note={data.estimated_usage_source} />
 <UsageMetricCard label="Limit / Quota" value={formatUsd(data.usage_limit_usd)} note={data.usage_limit_source} />
 <UsageMetricCard label="Remaining" value={formatUsd(data.remaining_quota_usd)} note={data.remaining_quota_source} />
 <UsageMetricCard label="Active Project / Service" value={data.active_service?.name || data.active_project.name ||"—"} note={data.active_service ? data.active_project.name || undefined : undefined} />
 <UsageMetricCard label="Billing Period" value={`${formatDateOnly(data.billing_period_start)} → ${formatDateOnly(data.billing_period_end)}`} note={data.billing_period_source} />
 <UsageMetricCard label="Last Updated" value={formatDateTime(data.last_synced_at)} note={`Status: ${data.status}`} />
 </div>

 <SourceNotes title="Railway source notes" notes={data.data_source.notes} />

 <ModuleDataTable
 rows={data.rows}
 rowKey={(row) => `${row.date}-${row.scope}-${row.metric_type}`}
 columns={columns}
 storageKey="usage_railway_table_v1"
 exportBasename="railway-usage"
 density="compact"
 emptyMessage="No Railway usage rows found for this date range."
 maxBodyHeight="min(66vh, 760px)"
 />
 </div>
 );
}

function SourceNotes({ title, notes }: { title: string; notes: string[] }) {
 if (notes.length === 0) return null;
 return (
 <div className="rounded-2xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-4">
 <div className="text-sm font-semibold text-[var(--ats-text)]">{title}</div>
 <ul className="mt-2 space-y-1 text-sm text-[var(--ats-text-muted)]">
 {notes.map((note) => (
 <li key={note}>• {note}</li>
 ))}
 </ul>
 </div>
 );
}

function ErrorState({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
 return (
 <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-6 text-center shadow-sm dark:border-rose-900 dark:bg-rose-950/40">
 <div className="text-base font-semibold text-rose-900 dark:text-rose-100">{title}</div>
 <p className="mt-1 text-sm text-rose-800 dark:text-rose-200">{message}</p>
 <button type="button" className={UI.secondaryButton +" mt-4 py-2 text-xs"} onClick={onRetry}>
 Retry
 </button>
 </div>
 );
}

function SkeletonState({ rows = 4 }: { rows?: number }) {
 return (
 <div className={`${UI.enterprise.elevatedCard} p-6`}>
 <div className="space-y-2">
 {Array.from({ length: rows }).map((_, index) => (
 <div key={index} className="h-10 animate-pulse rounded bg-[var(--ats-bg-subtle)]" />
 ))}
 </div>
 </div>
 );
}

function DateFilter({
 preset,
 setPreset,
 from,
 setFrom,
 to,
 setTo,
}: {
 preset: Preset;
 setPreset: (value: Preset) => void;
 from: string;
 setFrom: (value: string) => void;
 to: string;
 setTo: (value: string) => void;
}) {
 const [open, setOpen] = useState(false);
 const labels: Record<Preset, string> = {
 today:"Today",
 last7:"Last 7 Days",
 thisMonth:"This Month",
 custom:"Custom Range",
 };

 return (
 <div className="relative">
 <button type="button" onClick={() => setOpen((value) => !value)} className={UI.secondaryButton +" py-2 text-xs"}>
 <Calendar className="h-3.5 w-3.5" />
 {labels[preset]}
 </button>
 {open ? (
 <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-[var(--ats-border)] bg-[var(--ats-bg-panel)] p-2 shadow-lg">
 {(Object.keys(labels) as Preset[]).map((item) => (
 <button
 key={item}
 type="button"
 onClick={() => {
 setPreset(item);
 if (item !=="custom") setOpen(false);
 }}
 className={[
"block w-full rounded-lg px-3 py-2 text-left text-xs font-medium transition",
 preset === item
 ?"bg-[var(--ats-primary)]\/10 text-[var(--ats-primary)]"
 :"text-[var(--ats-text)] hover:bg-[var(--ats-bg-elevated)] dark:hover:bg-slate-800",
 ].join("")}
 >
 {labels[item]}
 </button>
 ))}
 {preset ==="custom" ? (
 <div className="mt-2 space-y-2 border-t border-[var(--ats-border)] pt-2">
 <DatePicker value={from} onChange={setFrom} className="text-xs" aria-label="Usage start date" />
 <DatePicker value={to} onChange={setTo} min={from} className="text-xs" aria-label="Usage end date" />
 <button type="button" onClick={() => setOpen(false)} className={UI.primaryButton +" w-full py-2 text-xs"}>
 Apply
 </button>
 </div>
 ) : null}
 </div>
 ) : null}
 </div>
 );
}
