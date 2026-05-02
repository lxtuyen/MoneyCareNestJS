export type CatOption = {
  id: number;
  name: string;
  type: 'income' | 'expense' | 'others';
};

export type ChatTransactionResult = {
  amount: number | null;
  category_name: string | null;
  description: string | null;
  time: string | null;
  type: 'income' | 'expense';
  wallet_name: string | null;
  confidence: number;
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

export type CategoryQuery = {
  action: 'get_categories' | 'add_category';
  name: string | null;
  type: 'income' | 'expense' | 'others';
  icon: string | null;
  isEssential: boolean | null;
  percentage: number | null;
};

export type CategoryQueryResult = {
  action: 'get_categories' | 'add_category';
  categories?: any[];
  category?: any;
  message?: string;
};
