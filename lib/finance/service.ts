import { query } from "@/lib/db";
import type {
  FinanceDashboardTotals,
  FinanceImportBatch,
  FinancePartner,
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

export { toMinor };
