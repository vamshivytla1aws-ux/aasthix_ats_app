import { query } from "@/lib/db";
import type {
  FinanceAnalyticsSeries,
  FinanceBackupPayload,
  FinanceDashboardTotals,
  FinanceDateRangePreset,
  FinanceImportBatch,
  FinancePartner,
  FinancePartnerStatementSummary,
  FinanceRangeInput,
  FinanceRestorePreview,
  FinanceTransaction,
  FinanceTransactionKind,
} from "@/lib/finance/types";

function createTxId() {
  return `fin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toDateOnly(input: string) {
  const trimmed = input.trim();
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return trimmed;
  const dmy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  throw new Error("Date must be DD/MM/YYYY or YYYY-MM-DD");
}

function toMinor(value: string | number) {
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  return Math.round(n * 100);
}

export async function getWorkspace() {
  const res = await query(
    `SELECT id, code, name, currency FROM finance_workspaces WHERE code = 'AASTHIX' LIMIT 1`
  );
  if (!res.rowCount) throw new Error("Finance workspace not initialized. Run migrations.");
  return res.rows[0] as { id: number; code: string; name: string; currency: string };
}

export async function listPartners(workspaceId: number): Promise<FinancePartner[]> {
  const res = await query(
    `SELECT id, workspace_id, name, email, role_label, joined_at::text AS joined_at, is_active
     FROM finance_partners
     WHERE workspace_id = $1
     ORDER BY lower(name) ASC`,
    [workspaceId]
  );
  return res.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    workspaceId: Number(row.workspace_id),
    name: String(row.name),
    email: (row.email as string | null) ?? null,
    roleLabel: (row.role_label as string | null) ?? null,
    joinedAt: (row.joined_at as string | null) ?? null,
    isActive: Boolean(row.is_active),
  })) satisfies FinancePartner[];
}

export async function createPartner(input: {
  workspaceId: number;
  name: string;
  email?: string | null;
  roleLabel?: string | null;
  joinedAt?: string | null;
}) {
  if (!input.name.trim()) throw new Error("Partner name is required.");
  const res = await query(
    `INSERT INTO finance_partners (workspace_id, name, email, role_label, joined_at, is_active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, workspace_id, name, email, role_label, joined_at::text AS joined_at, is_active`,
    [input.workspaceId, input.name.trim(), input.email ?? null, input.roleLabel ?? null, input.joinedAt ?? null]
  );
  return {
    id: Number(res.rows[0].id),
    workspaceId: Number(res.rows[0].workspace_id),
    name: String(res.rows[0].name),
    email: (res.rows[0].email as string | null) ?? null,
    roleLabel: (res.rows[0].role_label as string | null) ?? null,
    joinedAt: (res.rows[0].joined_at as string | null) ?? null,
    isActive: Boolean(res.rows[0].is_active),
  } satisfies FinancePartner;
}

export async function updatePartner(input: {
  id: number;
  workspaceId: number;
  name: string;
  email?: string | null;
  roleLabel?: string | null;
  isActive?: boolean;
}) {
  const res = await query(
    `UPDATE finance_partners
     SET name = $3, email = $4, role_label = $5, is_active = COALESCE($6, is_active), updated_at = NOW()
     WHERE id = $1 AND workspace_id = $2
     RETURNING id, workspace_id, name, email, role_label, joined_at::text AS joined_at, is_active`,
    [input.id, input.workspaceId, input.name.trim(), input.email ?? null, input.roleLabel ?? null, input.isActive ?? null]
  );
  if (!res.rowCount) throw new Error("Partner not found.");
  return {
    id: Number(res.rows[0].id),
    workspaceId: Number(res.rows[0].workspace_id),
    name: String(res.rows[0].name),
    email: (res.rows[0].email as string | null) ?? null,
    roleLabel: (res.rows[0].role_label as string | null) ?? null,
    joinedAt: (res.rows[0].joined_at as string | null) ?? null,
    isActive: Boolean(res.rows[0].is_active),
  } satisfies FinancePartner;
}

type UpsertTxInput = {
  id?: number;
  workspaceId: number;
  kind: FinanceTransactionKind;
  date: string;
  description: string;
  category: string;
  totalMinor: number;
  currency?: string;
  partnerId?: number | null;
  accountEntryType?: "debit" | "credit" | null;
  payments?: Array<{ partnerId: number; amountMinor: number }>;
  shares?: Array<{ partnerId: number; amountMinor: number }>;
  metadata?: Record<string, unknown>;
  sourceFingerprint?: string | null;
  importBatchId?: string | null;
  auditNote?: string | null;
  createdByUserId?: number | null;
};

export async function upsertTransaction(input: UpsertTxInput): Promise<FinanceTransaction> {
  const payload = [
    input.workspaceId,
    input.kind,
    toDateOnly(input.date),
    input.description.trim() || "Transaction",
    input.category.trim() || "General",
    input.totalMinor,
    input.currency ?? "INR",
    input.partnerId ?? null,
    input.accountEntryType ?? null,
    JSON.stringify(input.payments ?? []),
    JSON.stringify(input.shares ?? []),
    JSON.stringify(input.metadata ?? {}),
    input.sourceFingerprint ?? null,
    input.importBatchId ?? null,
    input.auditNote ?? null,
    input.createdByUserId ?? null,
  ];

  if (input.id) {
    const res = await query(
      `UPDATE finance_transactions
       SET kind = $2, tx_date = $3, description = $4, category = $5, total_minor = $6, currency = $7,
           partner_id = $8, account_entry_type = $9, payments_json = $10::jsonb, shares_json = $11::jsonb,
           metadata_json = $12::jsonb, source_fingerprint = $13, import_batch_id = $14, audit_note = $15, updated_at = NOW()
       WHERE id = $1 AND workspace_id = $16
       RETURNING *`,
      [
        input.id,
        input.kind,
        payload[2],
        payload[3],
        payload[4],
        payload[5],
        payload[6],
        payload[7],
        payload[8],
        payload[9],
        payload[10],
        payload[11],
        payload[12],
        payload[13],
        payload[14],
        payload[0],
      ]
    );
    if (!res.rowCount) throw new Error("Transaction not found.");
    return mapTx(res.rows[0]);
  }

  const txId = createTxId();
  const res = await query(
    `INSERT INTO finance_transactions (
      workspace_id, tx_id, kind, tx_date, description, category, total_minor, currency,
      partner_id, account_entry_type, payments_json, shares_json, metadata_json,
      source_fingerprint, import_batch_id, audit_note, created_by_user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
      $14, $15, $16, $17
    ) RETURNING *`,
    [payload[0], txId, payload[1], payload[2], payload[3], payload[4], payload[5], payload[6], payload[7], payload[8], payload[9], payload[10], payload[11], payload[12], payload[13], payload[14], payload[15]]
  );
  return mapTx(res.rows[0]);
}

function mapTx(row: Record<string, unknown>): FinanceTransaction {
  return {
    id: Number(row.id),
    txId: String(row.tx_id),
    workspaceId: Number(row.workspace_id),
    kind: String(row.kind) as FinanceTransactionKind,
    date: String(row.tx_date).slice(0, 10),
    description: String(row.description),
    category: String(row.category),
    totalMinor: Number(row.total_minor),
    currency: String(row.currency),
    partnerId: row.partner_id == null ? null : Number(row.partner_id),
    accountEntryType: (row.account_entry_type as "debit" | "credit" | null) ?? null,
    payments: (row.payments_json as Array<{ partnerId: number; amountMinor: number }>) ?? [],
    shares: (row.shares_json as Array<{ partnerId: number; amountMinor: number }>) ?? [],
    metadata: (row.metadata_json as Record<string, unknown>) ?? {},
    sourceFingerprint: (row.source_fingerprint as string | null) ?? null,
    importBatchId: (row.import_batch_id as string | null) ?? null,
    auditNote: (row.audit_note as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function listTransactions(input: {
  workspaceId: number;
  kind?: string;
  queryText?: string;
  fromDate?: string;
  toDate?: string;
  sort?: "asc" | "desc";
}): Promise<FinanceTransaction[]> {
  const sort = input.sort === "asc" ? "ASC" : "DESC";
  const params: unknown[] = [input.workspaceId];
  let where = `workspace_id = $1`;
  if (input.kind && input.kind !== "all") {
    params.push(input.kind);
    where += ` AND kind = $${params.length}`;
  }
  if (input.queryText?.trim()) {
    params.push(`%${input.queryText.trim().toLowerCase()}%`);
    where += ` AND (lower(description) LIKE $${params.length} OR lower(category) LIKE $${params.length})`;
  }
  if (input.fromDate?.trim()) {
    params.push(toDateOnly(input.fromDate));
    where += ` AND tx_date >= $${params.length}`;
  }
  if (input.toDate?.trim()) {
    params.push(toDateOnly(input.toDate));
    where += ` AND tx_date <= $${params.length}`;
  }
  const res = await query(
    `SELECT * FROM finance_transactions
     WHERE ${where}
     ORDER BY tx_date ${sort}, created_at ${sort}`,
    params
  );
  return res.rows.map(mapTx);
}

export async function deleteTransaction(workspaceId: number, id: number) {
  await query(`DELETE FROM finance_transactions WHERE workspace_id = $1 AND id = $2`, [workspaceId, id]);
}

export async function listImportBatches(workspaceId: number): Promise<FinanceImportBatch[]> {
  const res = await query(
    `SELECT id, batch_id, workspace_id, source, status, notes, imported_transactions, skipped_duplicates,
            reconciliation_entries, warning_count, created_at, applied_at
     FROM finance_import_batches
     WHERE workspace_id = $1
     ORDER BY created_at DESC`,
    [workspaceId]
  );
  return res.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    batchId: String(row.batch_id),
    workspaceId: Number(row.workspace_id),
    source: String(row.source),
    status: String(row.status),
    notes: (row.notes as string | null) ?? null,
    importedTransactions: Number(row.imported_transactions),
    skippedDuplicates: Number(row.skipped_duplicates),
    reconciliationEntries: Number(row.reconciliation_entries),
    warningCount: Number(row.warning_count),
    createdAt: String(row.created_at),
    appliedAt: (row.applied_at as string | null) ?? null,
  })) satisfies FinanceImportBatch[];
}

export async function importStateSnapshot(input: {
  workspaceId: number;
  createdByUserId: number;
  payload: Record<string, unknown>;
}) {
  const batchId = `snapshot_${Date.now()}`;
  const txs = (input.payload.transactions as Array<Record<string, unknown>>) ?? [];
  let imported = 0;
  for (const tx of txs) {
    const groupId = String(tx.groupId ?? "");
    if (!groupId) continue;
    const totalMinor = Number(tx.totalMinor ?? 0);
    const kind = String(tx.kind ?? "expense") as FinanceTransactionKind;
    if (!Number.isFinite(totalMinor) || totalMinor <= 0) continue;
    const sourceFingerprint = (tx.sourceFingerprint as string | undefined) ?? null;
    try {
      await upsertTransaction({
        workspaceId: input.workspaceId,
        kind,
        date: String(tx.date ?? new Date().toISOString().slice(0, 10)),
        description: String(tx.description ?? "Imported transaction"),
        category: String(tx.category ?? "General"),
        totalMinor,
        currency: String(tx.currency ?? "INR"),
        partnerId: null,
        accountEntryType: (tx.accountEntryType as "debit" | "credit" | undefined) ?? null,
        payments: (tx.payments as Array<{ partnerId: number; amountMinor: number }>) ?? [],
        shares: (tx.shares as Array<{ partnerId: number; amountMinor: number }>) ?? [],
        metadata: {
          sourceTag: tx.sourceTag ?? "snapshot_json",
          legacyTxId: tx.id ?? null,
        },
        sourceFingerprint,
        importBatchId: batchId,
        auditNote: "Migrated from groups-split-web snapshot",
        createdByUserId: input.createdByUserId,
      });
      imported += 1;
    } catch {
      // ignore duplicates/failures for idempotent import
    }
  }

  await query(
    `INSERT INTO finance_import_batches (
      workspace_id, batch_id, source, status, notes, imported_transactions, skipped_duplicates,
      reconciliation_entries, warning_count, source_payload, applied_at
    ) VALUES ($1, $2, 'state_snapshot_json', 'applied', $3, $4, 0, 0, 0, $5::jsonb, NOW())`,
    [input.workspaceId, batchId, "JSON snapshot import", imported, JSON.stringify({ imported })]
  );

  return { batchId, imported };
}

export async function computeDashboardTotals(workspaceId: number): Promise<FinanceDashboardTotals> {
  const [partners, transactions] = await Promise.all([
    listPartners(workspaceId),
    listTransactions({ workspaceId, sort: "desc" }),
  ]);
  const totalPartnerInvestedMinor = transactions
    .filter((tx) => tx.kind === "partner_investment" || tx.kind === "expense")
    .reduce((sum, tx) => sum + tx.totalMinor, 0);
  const totalCompanyExpensesMinor = transactions
    .filter((tx) => tx.kind === "company_expense")
    .reduce((sum, tx) => sum + tx.totalMinor, 0);
  const totalCompanyAccountDebitsMinor = transactions
    .filter((tx) => tx.kind === "company_account_entry" && tx.accountEntryType === "debit")
    .reduce((sum, tx) => sum + tx.totalMinor, 0);
  const totalCompanyAccountCreditsMinor = transactions
    .filter((tx) => tx.kind === "company_account_entry" && tx.accountEntryType === "credit")
    .reduce((sum, tx) => sum + tx.totalMinor, 0);

  const investedByPartnerId = new Map<number, number>();
  for (const partner of partners.filter((p) => p.isActive)) investedByPartnerId.set(partner.id, 0);
  for (const tx of transactions.filter((t) => t.kind === "partner_investment" || t.kind === "expense")) {
    for (const p of tx.payments) {
      investedByPartnerId.set(p.partnerId, (investedByPartnerId.get(p.partnerId) ?? 0) + p.amountMinor);
    }
  }
  const benchmark = Math.max(...Array.from(investedByPartnerId.values()), 0);
  const equalization = partners
    .filter((p) => p.isActive)
    .map((p) => {
      const investedMinor = investedByPartnerId.get(p.id) ?? 0;
      return {
        partnerId: p.id,
        partnerName: p.name,
        investedMinor,
        deltaToEqualMinor: benchmark - investedMinor,
      };
    })
    .sort((a, b) => b.investedMinor - a.investedMinor);

  return {
    totalPartnerInvestedMinor,
    totalCompanyExpensesMinor,
    totalCompanyAccountDebitsMinor,
    totalCompanyAccountCreditsMinor,
    companyAccountBalanceMinor: totalCompanyAccountCreditsMinor - totalCompanyAccountDebitsMinor,
    recentLedger: transactions.slice(0, 10),
    equalization,
  } satisfies FinanceDashboardTotals;
}

function resolveRange(input: FinanceRangeInput) {
  if (input.preset === "full") return { from: "", to: "", label: "Full view" };
  if (input.preset === "monthly" && input.month) {
    const from = `${input.month}-01`;
    const [y, m] = input.month.split("-").map((v) => Number(v));
    const endDay = new Date(y, m, 0).getDate();
    return { from, to: `${input.month}-${String(endDay).padStart(2, "0")}`, label: input.month };
  }
  if (input.preset === "yearly" && input.year) {
    return { from: `${input.year}-01-01`, to: `${input.year}-12-31`, label: input.year };
  }
  return {
    from: input.from ? toDateOnly(input.from) : "",
    to: input.to ? toDateOnly(input.to) : "",
    label: input.from && input.to ? `${input.from} to ${input.to}` : "Custom",
  };
}

function inRange(date: string, from: string, to: string) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export async function buildPartnerStatement(
  workspaceId: number,
  partnerId: number,
  range: FinanceRangeInput
): Promise<FinancePartnerStatementSummary> {
  const [partners, txs] = await Promise.all([listPartners(workspaceId), listTransactions({ workspaceId, sort: "desc" })]);
  const partner = partners.find((p) => p.id === partnerId);
  if (!partner) throw new Error("Partner not found.");
  const { from, to } = resolveRange(range);
  const rows = txs
    .filter((tx) => inRange(tx.date, from, to))
    .filter((tx) => tx.payments.some((p) => p.partnerId === partnerId))
    .map((tx) => ({
      txId: tx.txId,
      date: tx.date,
      narration: tx.description,
      category: tx.category,
      investedMinor: tx.payments
        .filter((p) => p.partnerId === partnerId)
        .reduce((sum, p) => sum + p.amountMinor, 0),
    }))
    .sort((a, b) => (a.date === b.date ? b.txId.localeCompare(a.txId) : b.date.localeCompare(a.date)));

  let running = 0;
  const withRunning = [...rows].reverse().map((row) => {
    running += row.investedMinor;
    return { ...row, runningBalanceMinor: running };
  }).reverse();

  const totalInvestedMinor = withRunning.reduce((sum, row) => sum + row.investedMinor, 0);
  const totalDebitMinor = 0;
  const totalCreditMinor = totalInvestedMinor;
  return {
    partnerId: partner.id,
    partnerName: partner.name,
    totalInvestedMinor,
    totalDebitMinor,
    totalCreditMinor,
    netMinor: totalCreditMinor - totalDebitMinor,
    rowCount: withRunning.length,
    rows: withRunning,
  };
}

export async function buildAnalytics(
  workspaceId: number,
  range: FinanceRangeInput
): Promise<FinanceAnalyticsSeries> {
  const [partners, txs] = await Promise.all([listPartners(workspaceId), listTransactions({ workspaceId, sort: "desc" })]);
  const { from, to, label } = resolveRange(range);
  const filtered = txs.filter((tx) => inRange(tx.date, from, to));

  const monthMap = new Map<string, { investedMinor: number; expensesMinor: number; balanceDeltaMinor: number }>();
  const categoryMap = new Map<string, number>();
  for (const tx of filtered) {
    const month = tx.date.slice(0, 7);
    const bucket = monthMap.get(month) ?? { investedMinor: 0, expensesMinor: 0, balanceDeltaMinor: 0 };
    if (tx.kind === "partner_investment" || tx.kind === "expense") {
      bucket.investedMinor += tx.totalMinor;
    }
    if (tx.kind === "company_expense") {
      bucket.expensesMinor += tx.totalMinor;
      categoryMap.set(tx.category, (categoryMap.get(tx.category) ?? 0) + tx.totalMinor);
    }
    if (tx.kind === "company_account_entry") {
      bucket.balanceDeltaMinor += tx.accountEntryType === "credit" ? tx.totalMinor : -tx.totalMinor;
    }
    monthMap.set(month, bucket);
  }

  const monthlyInvestedVsExpenses = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, row]) => ({ month, investedMinor: row.investedMinor, expensesMinor: row.expensesMinor }));
  let rolling = 0;
  const companyBalanceTrend = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, row]) => {
      rolling += row.balanceDeltaMinor;
      return { month, balanceMinor: rolling };
    });

  const investedByPartner = new Map<number, number>();
  for (const tx of filtered.filter((t) => t.kind === "partner_investment" || t.kind === "expense")) {
    for (const p of tx.payments) {
      investedByPartner.set(p.partnerId, (investedByPartner.get(p.partnerId) ?? 0) + p.amountMinor);
    }
  }
  const totalInvested = Array.from(investedByPartner.values()).reduce((a, b) => a + b, 0);
  const partnerContributionShare = partners
    .filter((p) => p.isActive)
    .map((p) => {
      const investedMinor = investedByPartner.get(p.id) ?? 0;
      return {
        partnerId: p.id,
        partnerName: p.name,
        investedMinor,
        sharePercent: totalInvested > 0 ? Number(((investedMinor / totalInvested) * 100).toFixed(2)) : 0,
      };
    })
    .sort((a, b) => b.investedMinor - a.investedMinor);
  const peak = Math.max(...partnerContributionShare.map((p) => p.investedMinor), 0);
  const equalizationGapByPartner = partnerContributionShare.map((p) => ({
    partnerId: p.partnerId,
    partnerName: p.partnerName,
    deltaMinor: peak - p.investedMinor,
  }));
  const categorySpendMix = Array.from(categoryMap.entries())
    .map(([category, amountMinor]) => ({ category, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  return {
    rangeLabel: label,
    monthlyInvestedVsExpenses,
    companyBalanceTrend,
    partnerContributionShare,
    equalizationGapByPartner,
    categorySpendMix,
    recentLedger: filtered.slice(0, 10),
  };
}

export async function exportFinanceBackup(workspaceId: number): Promise<FinanceBackupPayload> {
  const [workspace, partners, transactions, batches, prefRes] = await Promise.all([
    getWorkspace(),
    listPartners(workspaceId),
    listTransactions({ workspaceId, sort: "desc" }),
    listImportBatches(workspaceId),
    query(
      `SELECT id, user_id, workspace_id, table_density, default_range_preset, contribution_target_minor, last_filters_json
       FROM finance_user_preferences
       WHERE workspace_id = $1`,
      [workspaceId]
    ),
  ]);
  const preferences = prefRes.rows.map((row: Record<string, unknown>) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    workspaceId: Number(row.workspace_id),
    tableDensity: (row.table_density as string | null) ?? null,
    defaultRangePreset: (row.default_range_preset as string | null) ?? null,
    contributionTargetMinor: row.contribution_target_minor == null ? null : Number(row.contribution_target_minor),
    lastFilters: (row.last_filters_json as Record<string, unknown>) ?? {},
  }));
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    partners,
    transactions,
    importBatches: batches,
    preferences,
  };
}

export function previewRestoreBackup(payload: FinanceBackupPayload): FinanceRestorePreview {
  if (!payload || payload.schemaVersion !== 1) throw new Error("Unsupported backup format.");
  const txs = payload.transactions ?? [];
  const dates = txs.map((t) => t.date).filter(Boolean).sort();
  const totalInvestedMinor = txs
    .filter((t) => t.kind === "partner_investment" || t.kind === "expense")
    .reduce((sum, t) => sum + t.totalMinor, 0);
  const totalCompanyExpensesMinor = txs
    .filter((t) => t.kind === "company_expense")
    .reduce((sum, t) => sum + t.totalMinor, 0);
  const totalCompanyAccountDebitsMinor = txs
    .filter((t) => t.kind === "company_account_entry" && t.accountEntryType === "debit")
    .reduce((sum, t) => sum + t.totalMinor, 0);
  const totalCompanyAccountCreditsMinor = txs
    .filter((t) => t.kind === "company_account_entry" && t.accountEntryType === "credit")
    .reduce((sum, t) => sum + t.totalMinor, 0);
  const warnings: string[] = [];
  if (!payload.workspace?.name) warnings.push("Workspace metadata missing.");
  if (!payload.partners?.length) warnings.push("No partners found in backup.");
  return {
    workspaceName: payload.workspace?.name ?? "Unknown",
    partnerCount: payload.partners?.length ?? 0,
    transactionCount: txs.length,
    batchCount: payload.importBatches?.length ?? 0,
    totalInvestedMinor,
    totalCompanyExpensesMinor,
    totalCompanyAccountDebitsMinor,
    totalCompanyAccountCreditsMinor,
    earliestDate: dates[0] ?? null,
    latestDate: dates[dates.length - 1] ?? null,
    warnings,
  };
}

export async function applyRestoreBackup(input: {
  workspaceId: number;
  payload: FinanceBackupPayload;
  createdByUserId: number;
}) {
  const preview = previewRestoreBackup(input.payload);
  const client = await query("SELECT 1"); // connectivity check
  void client;
  const poolMod = await import("@/lib/db");
  const dbClient = await poolMod.pool.connect();
  try {
    await dbClient.query("BEGIN");
    const preBackup = await exportFinanceBackup(input.workspaceId);
    const preBatchId = `pre_restore_${Date.now()}`;
    await dbClient.query(
      `INSERT INTO finance_import_batches (
        workspace_id, batch_id, source, status, notes, imported_transactions, skipped_duplicates, reconciliation_entries, warning_count, source_payload, applied_at
      ) VALUES ($1, $2, 'finance_backup_restore_pre_snapshot', 'applied', $3, 0, 0, 0, 0, $4::jsonb, NOW())`,
      [input.workspaceId, preBatchId, "Auto snapshot before restore", JSON.stringify(preBackup)]
    );

    await dbClient.query(`DELETE FROM finance_transactions WHERE workspace_id = $1`, [input.workspaceId]);
    await dbClient.query(`DELETE FROM finance_partners WHERE workspace_id = $1`, [input.workspaceId]);
    await dbClient.query(`DELETE FROM finance_import_batches WHERE workspace_id = $1 AND batch_id <> $2`, [input.workspaceId, preBatchId]);
    await dbClient.query(`DELETE FROM finance_user_preferences WHERE workspace_id = $1`, [input.workspaceId]);

    const partnerIdMap = new Map<number, number>();
    for (const partner of input.payload.partners ?? []) {
      const inserted = await dbClient.query(
        `INSERT INTO finance_partners (workspace_id, name, email, role_label, joined_at, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [input.workspaceId, partner.name, partner.email, partner.roleLabel, partner.joinedAt, partner.isActive]
      );
      partnerIdMap.set(partner.id, Number(inserted.rows[0].id));
    }

    for (const tx of input.payload.transactions ?? []) {
      const remapAlloc = (items: Array<{ partnerId: number; amountMinor: number }>) =>
        items
          .map((item) => ({ partnerId: partnerIdMap.get(item.partnerId) ?? item.partnerId, amountMinor: item.amountMinor }))
          .filter((item) => Number.isFinite(item.partnerId));
      await dbClient.query(
        `INSERT INTO finance_transactions (
          workspace_id, tx_id, kind, tx_date, description, category, total_minor, currency, partner_id, account_entry_type,
          payments_json, shares_json, metadata_json, source_fingerprint, import_batch_id, audit_note, created_by_user_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16,$17
        )`,
        [
          input.workspaceId,
          tx.txId,
          tx.kind,
          tx.date,
          tx.description,
          tx.category,
          tx.totalMinor,
          tx.currency,
          tx.partnerId ? (partnerIdMap.get(tx.partnerId) ?? null) : null,
          tx.accountEntryType,
          JSON.stringify(remapAlloc(tx.payments ?? [])),
          JSON.stringify(remapAlloc(tx.shares ?? [])),
          JSON.stringify({ ...(tx.metadata ?? {}), originContext: "backup_restore" }),
          tx.sourceFingerprint,
          tx.importBatchId,
          tx.auditNote,
          input.createdByUserId,
        ]
      );
    }

    for (const batch of input.payload.importBatches ?? []) {
      await dbClient.query(
        `INSERT INTO finance_import_batches (
          workspace_id, batch_id, source, status, notes, imported_transactions, skipped_duplicates,
          reconciliation_entries, warning_count, source_payload, created_at, applied_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())`,
        [
          input.workspaceId,
          batch.batchId,
          batch.source,
          batch.status,
          batch.notes,
          batch.importedTransactions,
          batch.skippedDuplicates,
          batch.reconciliationEntries,
          batch.warningCount,
          JSON.stringify({ restored: true }),
        ]
      );
    }

    for (const pref of input.payload.preferences ?? []) {
      await dbClient.query(
        `INSERT INTO finance_user_preferences (
          user_id, workspace_id, table_density, default_range_preset, contribution_target_minor, last_filters_json
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          pref.userId,
          input.workspaceId,
          pref.tableDensity,
          pref.defaultRangePreset,
          pref.contributionTargetMinor,
          JSON.stringify(pref.lastFilters ?? {}),
        ]
      );
    }

    const restoreBatchId = `restore_${Date.now()}`;
    await dbClient.query(
      `INSERT INTO finance_import_batches (
        workspace_id, batch_id, source, status, notes, imported_transactions, skipped_duplicates, reconciliation_entries, warning_count, source_payload, applied_at
      ) VALUES ($1,$2,'finance_backup_restore','applied',$3,$4,0,0,$5,$6::jsonb,NOW())`,
      [
        input.workspaceId,
        restoreBatchId,
        "Finance backup restore applied",
        preview.transactionCount,
        preview.warnings.length,
        JSON.stringify({ preview }),
      ]
    );

    await dbClient.query("COMMIT");
    return { restoreBatchId, preview };
  } catch (error) {
    await dbClient.query("ROLLBACK");
    throw error;
  } finally {
    dbClient.release();
  }
}

export { toMinor };
