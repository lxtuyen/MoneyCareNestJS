export type CatOption = {
  id: number;
  name: string;
};

export type ChatExpenseResult = {
  amount: number | null;
  category_name: string | null;
  description: string | null;
  time: string | null;
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

export interface ReceiptItem {
  name: string;
  amount: number;
  category: string;
  categoryId: number | null;
}

export interface ReceiptScanResult {
  merchant_name: string | null;
  date: string | null;
  total_amount: number | null;
  items: ReceiptItem[];
}
