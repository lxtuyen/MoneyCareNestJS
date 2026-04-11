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
