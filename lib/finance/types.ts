export type FinanceTransactionKind =
  | "partner_investment"
  | "company_expense"
  | "company_inflow"
  | "company_account_entry"
  | "expense"
  | "reconciliation_adjustment";

export type FinanceAccountEntryType = "debit" | "credit";

export type FinancePartner = {
  id: number;
  workspaceId: number;
  name: string;
  email: string | null;
  roleLabel: string | null;
  joinedAt: string | null;
  isActive: boolean;
};

export type FinanceTransaction = {
  id: number;
  txId: string;
  workspaceId: number;
  kind: FinanceTransactionKind;
  date: string;
  description: string;
  category: string;
  totalMinor: number;
  currency: string;
  partnerId: number | null;
  accountEntryType: FinanceAccountEntryType | null;
  payments: Array<{ partnerId: number; amountMinor: number }>;
  shares: Array<{ partnerId: number; amountMinor: number }>;
  metadata: Record<string, unknown>;
  sourceFingerprint: string | null;
  importBatchId: string | null;
  auditNote: string | null;
  createdAt: string;
};

export type FinanceImportBatch = {
  id: number;
  batchId: string;
  workspaceId: number;
  source: string;
  status: string;
  notes: string | null;
  importedTransactions: number;
  skippedDuplicates: number;
  reconciliationEntries: number;
  warningCount: number;
  createdAt: string;
  appliedAt: string | null;
};

export type FinanceDashboardTotals = {
  totalPartnerInvestedMinor: number;
  totalCompanyExpensesMinor: number;
  totalCompanyAccountDebitsMinor: number;
  totalCompanyAccountCreditsMinor: number;
  companyAccountBalanceMinor: number;
  recentLedger: FinanceTransaction[];
  equalization: Array<{
    partnerId: number;
    partnerName: string;
    investedMinor: number;
    deltaToEqualMinor: number;
  }>;
};

export type FinanceDateRangePreset = "full" | "monthly" | "yearly" | "custom";

export type FinanceRangeInput = {
  preset: FinanceDateRangePreset;
  month?: string;
  year?: string;
  from?: string;
  to?: string;
};

export type FinancePartnerStatementRow = {
  txId: string;
  date: string;
  narration: string;
  category: string;
  investedMinor: number;
  runningBalanceMinor: number;
};

export type FinancePartnerStatementSummary = {
  partnerId: number;
  partnerName: string;
  totalInvestedMinor: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  netMinor: number;
  rowCount: number;
  rows: FinancePartnerStatementRow[];
};

export type FinanceAnalyticsSeries = {
  rangeLabel: string;
  monthlyInvestedVsExpenses: Array<{ month: string; investedMinor: number; expensesMinor: number }>;
  companyBalanceTrend: Array<{ month: string; balanceMinor: number }>;
  partnerContributionShare: Array<{ partnerId: number; partnerName: string; investedMinor: number; sharePercent: number }>;
  equalizationGapByPartner: Array<{ partnerId: number; partnerName: string; deltaMinor: number }>;
  categorySpendMix: Array<{ category: string; amountMinor: number }>;
  recentLedger: FinanceTransaction[];
};

export type FinanceBackupPayload = {
  schemaVersion: 1;
  exportedAt: string;
  workspace: { id: number; code: string; name: string; currency: string };
  partners: FinancePartner[];
  transactions: FinanceTransaction[];
  importBatches: FinanceImportBatch[];
  preferences: Array<{
    id: number;
    userId: number;
    workspaceId: number;
    tableDensity: string | null;
    defaultRangePreset: string | null;
    contributionTargetMinor: number | null;
    lastFilters: Record<string, unknown>;
  }>;
};

export type FinanceRestorePreview = {
  workspaceName: string;
  partnerCount: number;
  transactionCount: number;
  batchCount: number;
  totalInvestedMinor: number;
  totalCompanyExpensesMinor: number;
  totalCompanyAccountDebitsMinor: number;
  totalCompanyAccountCreditsMinor: number;
  earliestDate: string | null;
  latestDate: string | null;
  warnings: string[];
};
