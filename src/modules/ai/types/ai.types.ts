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
  period: 'this_month' | 'last_30_days' | 'target_month';
  targetMonth?: number;
  targetYear?: number;
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

export enum AiMessagePrefix {
  TRANSACTION_LIST = '__TRANSACTION_LIST__',
  TRANSACTION_SAVED = '__TRANSACTION_SAVED__',
  STRUCTURED_ANALYSIS = '__STRUCTURED_ANALYSIS__',
  SAVING_GOAL_CREATED = '__SAVING_GOAL_CREATED__',
  SAVING_GOAL_PROPOSAL = '__SAVING_GOAL_PROPOSAL__',
  SAVING_GOAL_INITIAL_FUND_ASK = '__SAVING_GOAL_INITIAL_FUND_ASK__',
  GOAL_ACHIEVEMENT_INSIGHT = '__GOAL_ACHIEVEMENT_INSIGHT__',
  CATEGORY_BREAKDOWN = '__CATEGORY_BREAKDOWN__',
}

export interface MapTransactionInput {
  id?: number;
  amount: number;
  type: 'income' | 'expense';
  note?: string;
  transaction_date?: string | Date;
  transactionDate?: string | Date;
  walletId?: number;
  category?: {
    id?: number;
    name?: string;
    icon?: string | null;
  } | null;
  subCategory?: {
    id?: number;
    name?: string;
    icon?: string | null;
  } | null;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, unknown>;
}

export interface GeminiResponse {
  functionCalls?: GeminiFunctionCall[];
}
