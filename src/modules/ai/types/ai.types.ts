export type CatOption = {
  id: number;
  name: string;
  type: 'income' | 'expense' | 'others';
  subCategories?: Array<{
    id: number;
    name: string;
    icon: string | null;
  }>;
};

export type ChatTransactionResult = {
  amount: number | null;
  category_name: string | null;
  sub_category_name: string | null;
  description: string | null;
  time: string | null;
  type: 'income' | 'expense';
  wallet_name: string | null;
  confidence: number;
  needs_clarification?: boolean;
  suggested_sub_categories?: string[];
};

export type BudgetPlanItem = {
  name: string;
  amount: number;
  description: string;
};

export type BudgetPlanGroup = {
  group_name: string;
  items: BudgetPlanItem[];
};

export type FinancialAnalysisResult = {
  summary: string;
  budget_plan: BudgetPlanGroup[];
};

export type GoalPlanInsightResult = {
  status: 'on_track' | 'delayed';
  summary: string;
  reason: string;
  suggestion: string;
};

export type InsightCategorySummary = {
  name: string;
  amount: number;
  changePct: number;
  percentageOfExpenses: number;
  icon: string | null;
};

export type FinancialInsightSnapshot = {
  period: 'this_month' | 'last_30_days';
  generatedAt: string;
  incomeTotal: number;
  expenseTotal: number;
  netBalance: number;
  dailyAverage: number;
  topCategories: InsightCategorySummary[];
  alerts: string[];
  comparisonPrevMonth: {
    incomeChangePct: number;
    expenseChangePct: number;
    netBalanceChangePct: number;
  };
};

export type GetTransactionQuery = {
  type: 'income' | 'expense' | 'all';
  startDate: string | null;
  endDate: string | null;
  category_name: string | null;
  limit: number | null;
};
