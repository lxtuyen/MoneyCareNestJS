export type ChatbotExpenseAnalysisSeverity =
  | 'info'
  | 'good'
  | 'stable'
  | 'warning'
  | 'danger';

export interface ChatbotOverviewCardPayload {
  financialHealthScore: number;
  cashFlowTrend: string;
  monthlyForecast: number;
  periodLabel: string;
  summary: string;
  expenseTotal?: number;
  incomeTotal?: number;
  netBalance?: number;
}

export interface ChatbotTopCategoryCardPayload {
  categoryName: string;
  amount: number;
  trend: string;
  note: string;
  percentageOfExpenses?: number;
}

export interface ChatbotForecastCardPayload {
  currentMonthProjection: {
    totalForecast?: number;
    predictedRemainingAmount?: number;
    confidence: number;
    riskLevel: string;
    modelNotes: string;
  } | null;
  riskWindows: Array<{
    periodStart?: string;
    periodEnd?: string;
    riskLevel: string;
    predictedAmount?: number;
    reason: string;
  }>;
}

export interface ChatbotAnomalyCardPayload {
  transactionId: number;
  amount: number;
  date: string;
  categoryName: string;
  reason: string;
}

export interface ChatbotBudgetRiskCardPayload {
  riskLevel: string;
  message: string;
  items: Array<{
    categoryName: string;
    limitAmount: number;
    spentAmount: number;
    riskScore: number;
    status: string;
  }>;
}

export interface ChatbotHabitSuggestionPayload {
  habitName: string;
  categoryName: string;
  currentMonthCount: number;
  currentMonthTotal: number;
  avgPerTransaction: number;
  projectedMonthCount: number;
  projectedMonthTotal: number;
  suggestedCount: number;
  potentialSavings: number;
  suggestionText: string;
  isEarlyEstimate: boolean;
}

export interface ChatbotRecommendationCardPayload {
  title: string;
  description: string;
  severity: ChatbotExpenseAnalysisSeverity;
}

export interface ChatbotExpenseAnalysisPayload {
  version: 2;
  type: 'expense_analysis';
  message: string;
  overview: ChatbotOverviewCardPayload;
  topCategories: ChatbotTopCategoryCardPayload[];
  forecast: ChatbotForecastCardPayload | null;
  anomalies: ChatbotAnomalyCardPayload[];
  budgetRisk: ChatbotBudgetRiskCardPayload | null;
  recommendations: ChatbotRecommendationCardPayload[];
  habitSuggestions: ChatbotHabitSuggestionPayload[];
  emptyState?: {
    title: string;
    message: string;
  };
}
