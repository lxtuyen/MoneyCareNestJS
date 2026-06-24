import { GoalAchievementPredictionSummaryDto } from 'src/modules/saving-goals/dto/goal-achievement-prediction.dto';

export interface AnalyticsServiceAnomalyResponse {
  transaction_id: number;
  amount: number;
  date: string;
  category_name: string;
  reason: string;
  anomaly_type?: string;
  severity?: string;
  expected_min_amount?: number;
  expected_max_amount?: number;
  deviation_pct?: number;
  reason_codes?: string[];
  reasonCodes?: string[];
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
  insight_type?: string;
  insightType?: string;
  priority?: number;
  action?: string;
  reason_codes?: string[];
  reasonCodes?: string[];
}

export interface ForecastDriverResponse {
  category_name?: string;
  categoryName?: string;
  contribution_amount?: number;
  contributionAmount?: number;
  contribution_pct?: number;
  contributionPct?: number;
  delta_vs_baseline?: number;
  deltaVsBaseline?: number;
  trend?: string;
  reason_codes?: string[];
  reasonCodes?: string[];
}

export interface ForecastConfidenceFactorResponse {
  code: string;
  impact: string;
  message: string;
}

export interface DataQualityWarningResponse {
  code: string;
  severity: string;
  message: string;
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
  top_drivers?: ForecastDriverResponse[];
  topDrivers?: ForecastDriverResponse[];
  delta_vs_last_month?: number;
  deltaVsLastMonth?: number;
  delta_vs_baseline?: number;
  deltaVsBaseline?: number;
  confidence_factors?: ForecastConfidenceFactorResponse[];
  confidenceFactors?: ForecastConfidenceFactorResponse[];
  data_quality_warnings?: DataQualityWarningResponse[];
  dataQualityWarnings?: DataQualityWarningResponse[];
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
  budget_exceed_predictions?: AnalyticsServiceBudgetExceedPredictionResponse[];
  budgetExceedPredictions?: AnalyticsServiceBudgetExceedPredictionResponse[];
  summary: string;
}

export interface AnalyticsServiceBudgetExceedPredictionResponse {
  category_name?: string;
  categoryName?: string;
  limit_amount?: number;
  limitAmount?: number;
  actual_amount?: number;
  actualAmount?: number;
  total_forecast?: number;
  totalForecast?: number;
  exceed_amount?: number;
  exceedAmount?: number;
  will_exceed?: boolean;
  willExceed?: boolean;
  exceed_probability?: number;
  exceedProbability?: number;
  confidence: number;
  trend: string;
  risk_level?: string;
  riskLevel?: string;
  actual_ratio?: number;
  actualRatio?: number;
  forecast_ratio?: number;
  forecastRatio?: number;
  expected_today_ratio?: number | null;
  expectedTodayRatio?: number | null;
  expected_today_amount?: number | null;
  expectedTodayAmount?: number | null;
  daily_forecast_amount?: number | null;
  dailyForecastAmount?: number | null;
  is_frequent?: boolean;
  isFrequent?: boolean;
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
  unpaid_recurring?: Array<{
    category_name: string;
    description: string;
    expected_day?: number | null;
    expected_amount: number;
    status: string;
  }>;
  habit_suggestions?: Array<{
    habit_name: string;
    category_name: string;
    current_month_count: number;
    current_month_total: number;
    avg_per_transaction: number;
    projected_month_count: number;
    projected_month_total: number;
    suggested_count: number;
    potential_savings: number;
    suggestion_text: string;
    is_early_estimate?: boolean;
  }>;
}

export interface AnalyticsMappedAnomaly {
  transactionId: number;
  amount: number;
  date: string;
  categoryName: string;
  categoryId: number | null;
  categoryIcon: string | null;
  type: string;
  note: string | null;
  walletId: number | null;
  walletName: string | null;
  reason: string;
}

export interface AnalyticsMappedResponse {
  financialHealthScore: number;
  cashFlowTrend: string;
  monthlyForecast: number;
  anomalies: AnalyticsMappedAnomaly[];
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
    insightType?: string;
    priority?: number;
    action?: string;
    reasonCodes?: string[];
  }>;
  forecasting: {
    currentMonthProjection: AnalyticsMappedMonthlyForecast | null;
    nextMonthForecast: AnalyticsMappedMonthlyForecast | null;
  } | null;
  aiBudgeting: AnalyticsMappedAiBudgeting | null;
  goalAchievement: GoalAchievementPredictionSummaryDto | null;
  unpaidRecurring: Array<{
    categoryName: string;
    description: string;
    expectedDay: number | null;
    expectedAmount: number;
    status: string;
  }>;
  habitSuggestions: Array<{
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
  }>;
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
  topDrivers?: Array<{
    categoryName?: string;
    contributionAmount?: number;
    contributionPct?: number;
    deltaVsBaseline?: number;
    trend?: string;
    reasonCodes: string[];
  }>;
  deltaVsLastMonth?: number;
  deltaVsBaseline?: number;
  confidenceFactors?: Array<{
    code: string;
    impact: string;
    message: string;
  }>;
  dataQualityWarnings?: Array<{
    code: string;
    severity: string;
    message: string;
  }>;
}

export interface AnalyticsMappedBudgetExceedPrediction {
  categoryName: string;
  limitAmount: number;
  actualAmount: number;
  totalForecast: number;
  exceedAmount: number;
  willExceed: boolean;
  exceedProbability: number;
  confidence: number;
  trend: string;
  riskLevel: string;
  actualRatio: number;
  forecastRatio: number;
  expectedTodayRatio: number | null;
  expectedTodayAmount: number | null;
  dailyForecastAmount: number | null;
  isFrequent: boolean;
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
  budgetExceedPredictions: AnalyticsMappedBudgetExceedPrediction[];
  summary: string;
}
