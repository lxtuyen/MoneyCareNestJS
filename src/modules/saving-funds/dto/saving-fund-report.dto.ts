export class CategorySpendingDto {
  category_id: number;
  category_name: string;
  total_spent: number;
  transaction_count: number;
  percentage: number;
}

export class SavingFundReportDto {
  fund_id: number;
  fund_name: string;
  start_date: Date;
  end_date: Date;
  status: string;

  // Budget & Target
  budget: number;
  target: number;
  total_spent: number;
  remaining_budget: number;

  // Completion metrics
  budget_usage_percentage: number;
  target_completion_percentage: number;
  is_over_budget: boolean;
  is_target_achieved: boolean;

  // Category breakdown
  category_breakdown: CategorySpendingDto[];

  // Transaction stats
  total_transactions: number;
  average_transaction_amount: number;

  // Time metrics
  duration_days: number;
  daily_average_spending: number;
}
