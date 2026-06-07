import { GoalAchievementPredictionSummaryDto } from 'src/modules/saving-goals/dto/goal-achievement-prediction.dto';
import {
  AnalyticsMappedMonthlyForecast,
  AnalyticsMappedResponse,
  AnalyticsServiceMonthlyForecastResponse,
  AnalyticsServiceResponse,
} from '../types/analytics-service-response.type';

export function mapAnalyticsResponse(
  data: AnalyticsServiceResponse,
  goalAchievement: GoalAchievementPredictionSummaryDto | null,
  spendingPlanPayload?: any,
  transactions?: any[],
): AnalyticsMappedResponse {
  const planId = spendingPlanPayload?.id;
  const categoryMap = new Map<
    string,
    { categoryId: number; planItemId?: number }
  >();

  // Map from transactions first (to get categoryIds)
  if (transactions) {
    for (const t of transactions) {
      if (t.category && t.category.id && t.category.name) {
        const normName = t.category.name.trim().toLowerCase();
        categoryMap.set(normName, { categoryId: t.category.id });
      }
    }
  }

  // Map from spending plan (to override with planItemId and categoryId if exists)
  if (spendingPlanPayload?.items) {
    for (const item of spendingPlanPayload.items) {
      if (item.category_name) {
        const normName = item.category_name.trim().toLowerCase();
        categoryMap.set(normName, {
          categoryId: item.category_id,
          planItemId: item.id,
        });
      }
    }
  }

  return {
    financialHealthScore: data.financial_health_score,
    cashFlowTrend: data.cash_flow_trend,
    monthlyForecast: data.monthly_forecast,
    anomalies: (data.anomalies || []).map((anomaly) => ({
      transactionId: anomaly.transaction_id,
      amount: anomaly.amount,
      date: anomaly.date,
      categoryName: anomaly.category_name,
      reason: anomaly.reason,
    })),
    budgetRisk: {
      riskLevel: data.budget_risk.risk_level,
      message: data.budget_risk.message,
      items: (data.budget_risk.items || []).map((item) => ({
        categoryName: item.category_name,
        limitAmount: item.limit_amount,
        spentAmount: item.spent_amount,
        riskScore: item.risk_score,
        status: item.status,
      })),
    },
    savingGoalProjections: (data.saving_goal_projections || []).map(
      (projection) => ({
        goalId: projection.goal_id,
        name: projection.name,
        monthsRemaining: projection.months_remaining,
        monthsDiff: projection.months_diff,
        isOnTrack: projection.is_on_track,
        statusText: projection.status_text,
      }),
    ),
    insights: (data.insights || []).map((insight) => ({
      title: insight.title,
      message: insight.message,
      severity: insight.severity,
      evidence: insight.evidence,
    })),
    forecasting: data.forecasting
      ? {
          currentMonthProjection: mapMonthlyForecast(
            data.forecasting.current_month_projection ||
              data.forecasting.currentMonthProjection ||
              null,
          ),
          nextMonthForecast: mapMonthlyForecast(
            data.forecasting.next_month_forecast ||
              data.forecasting.nextMonthForecast ||
              null,
          ),
        }
      : null,
    aiBudgeting: data.ai_budgeting
      ? {
          method: data.ai_budgeting.method,
          modelVersion: data.ai_budgeting.model_version,
          targetSavingsAmount: data.ai_budgeting.target_savings_amount,
          recommendedTotalBudget: data.ai_budgeting.recommended_total_budget,
          expectedSavingsAmount: data.ai_budgeting.expected_savings_amount,
          confidence: data.ai_budgeting.confidence,
          strategy: data.ai_budgeting.strategy,
          items: (data.ai_budgeting.items || []).map((item) => {
            const normName = item.category_name.trim().toLowerCase();
            const mapping = categoryMap.get(normName);
            const itemCategoryId = mapping?.categoryId;
            const itemPlanItemId = mapping?.planItemId;
            const canApply = !!(planId && itemCategoryId);

            return {
              recommendationId: item.recommendation_id,
              planId: planId || undefined,
              planItemId: itemPlanItemId || undefined,
              categoryId: itemCategoryId || undefined,
              canApply,
              categoryName: item.category_name,
              currentLimitAmount: item.current_limit_amount,
              spentAmount: item.spent_amount,
              recommendedLimitAmount: item.recommended_limit_amount,
              predictedSpendAmount: item.predicted_spend_amount,
              adjustmentAmount: item.adjustment_amount,
              actionType: item.action_type,
              riskBefore: item.risk_before,
              riskAfter: item.risk_after,
              riskLevel: item.risk_level,
              confidence: item.confidence,
              elasticity: item.elasticity,
              reasonCodes: item.reason_codes || [],
              explanation: item.explanation,
              personalizationFactors: item.personalization_factors || {},
              expectedImpact: item.expected_impact || {},
              reason: item.reason,
            };
          }),
          summary: data.ai_budgeting.summary,
        }
      : null,
    goalAchievement,
  };
}

function mapMonthlyForecast(
  forecast: AnalyticsServiceMonthlyForecastResponse | null,
): AnalyticsMappedMonthlyForecast | null {
  if (!forecast) return null;

  return {
    method: forecast.method,
    modelId: forecast.model_id || forecast.modelId || null,
    modelVersion: forecast.model_version || forecast.modelVersion || 'v2',
    artifactScope: forecast.artifact_scope || forecast.artifactScope || null,
    artifactVersion:
      forecast.artifact_version || forecast.artifactVersion || null,
    periodType: forecast.period_type || forecast.periodType || 'month',
    forecastMode: forecast.forecast_mode || forecast.forecastMode,
    targetMonth: forecast.target_month || forecast.targetMonth,
    targetYear: forecast.target_year || forecast.targetYear,
    periodStart: forecast.period_start || forecast.periodStart,
    periodEnd: forecast.period_end || forecast.periodEnd,
    actualAmount:
      forecast.actual_amount !== undefined
        ? forecast.actual_amount
        : forecast.actualAmount,
    predictedRemainingAmount:
      forecast.predicted_remaining_amount !== undefined
        ? forecast.predicted_remaining_amount
        : forecast.predictedRemainingAmount,
    totalForecast:
      forecast.total_forecast !== undefined
        ? forecast.total_forecast
        : forecast.totalForecast,
    confidence: forecast.confidence,
    riskLevel: forecast.risk_level || forecast.riskLevel || 'low',
    modelNotes: forecast.model_notes || forecast.modelNotes || '',
    weeklyForecasts: (
      forecast.weekly_forecasts ||
      forecast.weeklyForecasts ||
      []
    ).map((week) => ({
      weekIndex: week.week_index || week.weekIndex,
      periodStart: week.period_start || week.periodStart,
      periodEnd: week.period_end || week.periodEnd,
      predictedAmount:
        week.predicted_amount !== undefined
          ? week.predicted_amount
          : week.predictedAmount,
      actualAmount:
        week.actual_amount !== undefined
          ? week.actual_amount
          : week.actualAmount,
      riskLevel: week.risk_level || week.riskLevel || 'low',
    })),
    categoryForecasts: (
      forecast.category_forecasts ||
      forecast.categoryForecasts ||
      []
    ).map((category) => ({
      categoryName: category.category_name || category.categoryName,
      predictedAmount:
        category.predicted_amount !== undefined
          ? category.predicted_amount
          : category.predictedAmount,
      actualAmount:
        category.actual_amount !== undefined
          ? category.actual_amount
          : category.actualAmount,
      remainingForecastAmount:
        category.remaining_forecast_amount !== undefined
          ? category.remaining_forecast_amount
          : category.remainingForecastAmount,
      trend: category.trend || 'stable',
      confidence: category.confidence,
      dataPoints:
        category.data_points !== undefined
          ? category.data_points
          : category.dataPoints,
      riskLevel: category.risk_level || category.riskLevel || 'low',
      reasonCodes: category.reason_codes || category.reasonCodes || [],
    })),
    riskWindows: (forecast.risk_windows || forecast.riskWindows || []).map(
      (riskWindow) => ({
        periodStart: riskWindow.period_start || riskWindow.periodStart,
        periodEnd: riskWindow.period_end || riskWindow.periodEnd,
        riskLevel: riskWindow.risk_level || riskWindow.riskLevel || 'low',
        predictedAmount:
          riskWindow.predicted_amount !== undefined
            ? riskWindow.predicted_amount
            : riskWindow.predictedAmount,
        reason: riskWindow.reason || '',
        reasonCodes: riskWindow.reason_codes || riskWindow.reasonCodes || [],
      }),
    ),
    dailyPoints: (forecast.daily_points || forecast.dailyPoints || []).map(
      (point) => ({
        date: point.date,
        predictedAmount:
          point.predicted_amount !== undefined
            ? point.predicted_amount
            : point.predictedAmount,
      }),
    ),
  };
}
