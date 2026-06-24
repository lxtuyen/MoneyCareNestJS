export interface AnalyticsSpendingPlanItemPayload {
  id: number;
  category_id: number;
  category_name: string;
  limit_amount: number;
  spent_amount: number;
}

export interface AnalyticsSpendingPlanPayload {
  id: number;
  month: number;
  year: number;
  planned_budget: number;
  planned_income: number;
  items: AnalyticsSpendingPlanItemPayload[];
}

export interface AnalyticsTransactionPayload {
  id: number;
  amount: number;
  transaction_date: Date | string;
  type: string;
  category: {
    id?: number;
    name: string;
    icon?: string;
    type?: string;
  };
  note: string;
  is_transfer: boolean;
  sub_category?: string | null;
}

export interface AnalyticsSavingGoalPayload {
  id: number;
  name: string;
  target: number;
  saved_amount: number;
  months: number;
  is_completed: boolean;
}

export interface AnalyticsPersonalProfilePayload {
  spending_style: string;
  risk_level: string;
  average_monthly_income: number;
  savings_rate: number;
  budget_discipline_score: number;
  expense_volatility_score: number;
  preferred_budget_buffer_pct: number;
  confidence_score: number;
}

export interface AnalyticsPredictionMetadata {
  transactionCount: number;
  period: string;
  hasSpendingPlan: boolean;
  activeGoalCount: number;
}

export interface AnalyticsAnalyzeRequestPayload {
  user_id: number;
  transactions: AnalyticsTransactionPayload[];
  spending_plan: AnalyticsSpendingPlanPayload | null;
  saving_goals: AnalyticsSavingGoalPayload[];
  period: string;
  personal_profile: AnalyticsPersonalProfilePayload;
  feedback_summary: unknown;
  model_evaluation: {
    overall_mape: number | null;
    evaluated_runs: number;
    category_mape: Record<string, number>;
  } | null;
  essential_categories: string[];
  target_month: number;
  target_year: number;
  confirmed_recurring: {
    category_name: string;
    average_amount: number;
    frequency: string;
    expected_day: number | null;
    monthly_estimate: number;
    description: string;
  }[];
}
