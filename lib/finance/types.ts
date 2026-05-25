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
