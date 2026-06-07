import { GoalAchievementPredictionSummaryDto } from 'src/modules/saving-goals/dto/goal-achievement-prediction.dto';

export interface AnalyticsServiceAnomalyResponse {
  transaction_id: number;
  amount: number;
  date: string;
  category_name: string;
  reason: string;
}

export interface AnalyticsServiceBudgetRiskItemResponse {
  category_name: string;
  limit_amount: number;
  spent_amount: number;
  risk_score: number;
  status: string;
}

export interface AnalyticsServiceBudgetRiskResponse {
  risk_level: string;
  message: string;
  items: AnalyticsServiceBudgetRiskItemResponse[];
}

export interface AnalyticsServiceSavingGoalProjectionResponse {
  goal_id: number;
  name: string;
  months_remaining: number;
  months_diff: number;
  is_on_track: boolean;
  status_text: string;
}

export interface AnalyticsServiceInsightResponse {
  title: string;
  message: string;
  severity: string;
  evidence: string;
}

export interface AnalyticsServiceForecastPointResponse {
  date: string;
  predicted_amount?: number;
  predictedAmount?: number;
}

export interface AnalyticsServiceWeeklyForecastResponse {
  week_index?: number;
  weekIndex?: number;
  period_start?: string;
  periodStart?: string;
  period_end?: string;
  periodEnd?: string;
  predicted_amount?: number;
  predictedAmount?: number;
  actual_amount?: number;
  actualAmount?: number;
  risk_level?: string;
  riskLevel?: string;
}

export interface AnalyticsServiceCategoryForecastResponse {
  category_name?: string;
  categoryName?: string;
  predicted_amount?: number;
  predictedAmount?: number;
  actual_amount?: number;
  actualAmount?: number;
  remaining_forecast_amount?: number;
  remainingForecastAmount?: number;
  trend?: string;
  confidence: number;
  data_points?: number;
  dataPoints?: number;
  risk_level?: string;
  riskLevel?: string;
  reason_codes?: string[];
  reasonCodes?: string[];
}

export interface AnalyticsServiceRiskWindowResponse {
  period_start?: string;
  periodStart?: string;
  period_end?: string;
  periodEnd?: string;
  risk_level?: string;
  riskLevel?: string;
  predicted_amount?: number;
  predictedAmount?: number;
  reason?: string;
  reason_codes?: string[];
  reasonCodes?: string[];
}

export interface AnalyticsServiceMonthlyForecastResponse {
  method: string;
  model_id?: string;
  modelId?: string;
  model_version?: string;
  modelVersion?: string;
  artifact_scope?: string | null;
  artifactScope?: string | null;
  artifact_version?: string | null;
  artifactVersion?: string | null;
  period_type?: string;
  periodType?: string;
  forecast_mode?: string;
  forecastMode?: string;
  target_month?: number;
  targetMonth?: number;
  target_year?: number;
  targetYear?: number;
  period_start?: string;
  periodStart?: string;
  period_end?: string;
  periodEnd?: string;
  actual_amount?: number;
  actualAmount?: number;
  predicted_remaining_amount?: number;
  predictedRemainingAmount?: number;
  total_forecast?: number;
  totalForecast?: number;
  confidence: number;
  risk_level?: string;
  riskLevel?: string;
  model_notes?: string;
  modelNotes?: string;
  weekly_forecasts?: AnalyticsServiceWeeklyForecastResponse[];
  weeklyForecasts?: AnalyticsServiceWeeklyForecastResponse[];
  daily_points?: AnalyticsServiceForecastPointResponse[];
  dailyPoints?: AnalyticsServiceForecastPointResponse[];
  category_forecasts?: AnalyticsServiceCategoryForecastResponse[];
  categoryForecasts?: AnalyticsServiceCategoryForecastResponse[];
  risk_windows?: AnalyticsServiceRiskWindowResponse[];
  riskWindows?: AnalyticsServiceRiskWindowResponse[];
}

export interface AnalyticsServiceForecastingResponse {
  current_month_projection?: AnalyticsServiceMonthlyForecastResponse | null;
  currentMonthProjection?: AnalyticsServiceMonthlyForecastResponse | null;
  next_month_forecast?: AnalyticsServiceMonthlyForecastResponse | null;
  nextMonthForecast?: AnalyticsServiceMonthlyForecastResponse | null;
}

export interface AnalyticsServiceBudgetRecommendationResponse {
  recommendation_id: string;
  category_name: string;
  current_limit_amount: number;
  spent_amount: number;
  recommended_limit_amount: number;
  predicted_spend_amount: number;
  adjustment_amount: number;
  action_type: string;
  risk_before: string;
  risk_after: string;
  risk_level: string;
  confidence: number;
  elasticity: string;
  reason_codes?: string[];
  explanation?: string;
  personalization_factors?: Record<string, unknown>;
  expected_impact?: Record<string, unknown>;
  reason: string;
}

export interface AnalyticsServiceAiBudgetingResponse {
  method: string;
  model_version: string;
  target_savings_amount: number;
  recommended_total_budget: number;
  expected_savings_amount: number;
  confidence: number;
  strategy: string;
  items: AnalyticsServiceBudgetRecommendationResponse[];
  summary: string;
}

export interface AnalyticsServiceResponse {
  financial_health_score: number;
  cash_flow_trend: string;
  monthly_forecast: number;
  anomalies: AnalyticsServiceAnomalyResponse[];
  budget_risk: AnalyticsServiceBudgetRiskResponse;
  saving_goal_projections: AnalyticsServiceSavingGoalProjectionResponse[];
  insights: AnalyticsServiceInsightResponse[];
  forecasting?: AnalyticsServiceForecastingResponse | null;
  ai_budgeting?: AnalyticsServiceAiBudgetingResponse | null;
}

export interface AnalyticsMappedResponse {
  financialHealthScore: number;
  cashFlowTrend: string;
  monthlyForecast: number;
  anomalies: Array<{
    transactionId: number;
    amount: number;
    date: string;
    categoryName: string;
    reason: string;
  }>;
  budgetRisk: {
    riskLevel: string;
    message: string;
    items: Array<{
      categoryName: string;
      limitAmount: number;
      spentAmount: number;
      riskScore: number;
      status: string;
    }>;
  };
  savingGoalProjections: Array<{
    goalId: number;
    name: string;
    monthsRemaining: number;
    monthsDiff: number;
    isOnTrack: boolean;
    statusText: string;
  }>;
  insights: Array<{
    title: string;
    message: string;
    severity: string;
    evidence: string;
  }>;
  forecasting: {
    currentMonthProjection: AnalyticsMappedMonthlyForecast | null;
    nextMonthForecast: AnalyticsMappedMonthlyForecast | null;
  } | null;
  aiBudgeting: AnalyticsMappedAiBudgeting | null;
  goalAchievement: GoalAchievementPredictionSummaryDto | null;
}

export interface AnalyticsMappedMonthlyForecast {
  method: string;
  modelId?: string | null;
  modelVersion: string;
  artifactScope?: string | null;
  artifactVersion?: string | null;
  periodType: string;
  forecastMode?: string;
  targetMonth?: number;
  targetYear?: number;
  periodStart?: string;
  periodEnd?: string;
  actualAmount?: number;
  predictedRemainingAmount?: number;
  totalForecast?: number;
  confidence: number;
  riskLevel: string;
  modelNotes: string;
  weeklyForecasts: Array<{
    weekIndex?: number;
    periodStart?: string;
    periodEnd?: string;
    predictedAmount?: number;
    actualAmount?: number;
    riskLevel: string;
  }>;
  categoryForecasts: Array<{
    categoryName?: string;
    predictedAmount?: number;
    actualAmount?: number;
    remainingForecastAmount?: number;
    trend: string;
    confidence: number;
    dataPoints?: number;
    riskLevel: string;
    reasonCodes: string[];
  }>;
  riskWindows: Array<{
    periodStart?: string;
    periodEnd?: string;
    riskLevel: string;
    predictedAmount?: number;
    reason: string;
    reasonCodes: string[];
  }>;
  dailyPoints: Array<{
    date: string;
    predictedAmount?: number;
  }>;
}

export interface AnalyticsMappedAiBudgeting {
  method: string;
  modelVersion: string;
  targetSavingsAmount: number;
  recommendedTotalBudget: number;
  expectedSavingsAmount: number;
  confidence: number;
  strategy: string;
  items: Array<{
    recommendationId: string;
    planId?: number;
    planItemId?: number;
    categoryId?: number;
    canApply: boolean;
    categoryName: string;
    currentLimitAmount: number;
    spentAmount: number;
    recommendedLimitAmount: number;
    predictedSpendAmount: number;
    adjustmentAmount: number;
    actionType: string;
    riskBefore: string;
    riskAfter: string;
    riskLevel: string;
    confidence: number;
    elasticity: string;
    reasonCodes: string[];
    explanation?: string;
    personalizationFactors: Record<string, unknown>;
    expectedImpact: Record<string, unknown>;
    reason: string;
  }>;
  summary: string;
}
