export class RecurringTransactionDto {
  recurringId: string;
  categoryName: string;
  categoryIcon: string;
  description: string;
  averageAmount: number;
  frequency: 'weekly' | 'bi_weekly' | 'monthly';
  confidence: number;
  lastOccurrence: string;
  nextExpectedDate: string;
  occurrenceCount: number;
  totalSpent: number;
  monthlyEstimate: number;
  amountTrend: 'stable' | 'increasing' | 'decreasing';
  recentTransactions: {
    id: number;
    amount: number;
    date: string;
    note: string;
  }[];
}

export class RecurringDetectResponseDto {
  recurringItems: RecurringTransactionDto[];
  totalMonthlyRecurring: number;
  scanMonths: number;
  transactionCount: number;
  /** ISO timestamp — khi nào DBSCAN chạy lần cuối */
  lastScannedAt?: string;
}
