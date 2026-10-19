export interface BillingOverview {
  balanceUsd: number;
  heldUsd: number;
  sellerBalanceUsd: number;
  demoCreditUsd: number;
  billingMode: 'demo' | 'stripe';
  platformFeeBps: number;
  demoCreditCapUsd: number;
}

export type TransactionType = 'CREDIT_PURCHASE' | 'DEMO_CREDIT' | 'USAGE_DEBIT' | 'SELLER_EARNING' | 'PAYOUT' | 'PAYOUT_REVERSAL' | 'REFUND' | 'ADJUSTMENT';

export interface BillingTransaction {
  id: string;
  type: TransactionType;
  account: 'BUYER' | 'SELLER';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  amountUsd: number;
  balanceAfterUsd: number | null;
  requestId: string | null;
  payoutId: string | null;
  description: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  projectId: string | null;
  dailyLimitUsd: number | null;
  monthlyLimitUsd: number | null;
  maxPerRequestUsd: number | null;
  maxPerTaskUsd: number | null;
  alertThresholds: number[];
  hardLimit: boolean;
  updatedAt: string;
}

export interface BudgetResponse {
  budget: Budget | null;
  daySpentUsd: number;
  monthSpentUsd: number;
  inFlightUsd: number;
  projectBudgets: Array<Budget & { projectName?: string }>;
  notes: { inFlight: string; enforcement: string };
}
