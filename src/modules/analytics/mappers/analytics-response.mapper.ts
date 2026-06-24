import { GoalAchievementPredictionSummaryDto } from 'src/modules/saving-goals/dto/goal-achievement-prediction.dto';
import {
  AnalyticsMappedAnomaly,
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

  // Build a lookup map from transactionId → transaction for O(1) anomaly enrichment
  const transactionLookup = new Map<number, any>();
  if (transactions) {
    for (const t of transactions) {
      transactionLookup.set(t.id, t);
    }
  }

  return {
    financialHealthScore: data.financial_health_score,
    cashFlowTrend: data.cash_flow_trend,
    monthlyForecast: data.monthly_forecast,
    anomalies: (data.anomalies || []).map((anomaly): AnalyticsMappedAnomaly => {
      const tx = transactionLookup.get(anomaly.transaction_id);
      return {
        transactionId: anomaly.transaction_id,
        amount: anomaly.amount,
        date: anomaly.date,
        categoryName: tx?.category?.name ?? anomaly.category_name,
        categoryId: tx?.category?.id ?? null,
        categoryIcon: tx?.category?.icon ?? null,
        type: tx?.type ?? 'expense',
        note: tx?.note ?? null,
        walletId: tx?.wallet?.id ?? null,
        walletName: tx?.wallet?.name ?? null,
        reason: anomaly.reason,
      };
    }),
    budgetRisk: {
      riskLevel: data.budget_risk.risk_level,
      message: data.budget_risk.message,
      items: (data.budget_risk.items || []).map((item) => {
        // Match forecast by category name
        const catForecasts =
          data.forecasting?.current_month_projection?.category_forecasts ||
          data.forecasting?.currentMonthProjection?.categoryForecasts ||
          [];
        const matched = catForecasts.find(
          (cf) =>
            (cf.category_name || cf.categoryName || '')
              .trim()
              .toLowerCase() === item.category_name.trim().toLowerCase(),
        );
        const forecastAmount =
          matched?.predicted_amount ?? matched?.predictedAmount ?? null;

        return {
          categoryName: item.category_name,
          limitAmount: item.limit_amount,
          spentAmount: item.spent_amount,
          riskScore: item.risk_score,
          status: item.status,
          forecastAmount:
            forecastAmount !== null && forecastAmount !== undefined
              ? Math.round(forecastAmount)
              : null,
        };
      }),
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
      insightType: insight.insight_type || insight.insightType,
      priority: insight.priority,
      action: insight.action,
      reasonCodes: insight.reason_codes || insight.reasonCodes || [],
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
          budgetExceedPredictions: (
            data.ai_budgeting.budget_exceed_predictions ||
            data.ai_budgeting['budgetExceedPredictions'] ||
            []
          ).map((pred) => ({
            categoryName: (pred.category_name || pred['categoryName']) ?? '',
            limitAmount: pred.limit_amount ?? pred['limitAmount'] ?? 0,
            actualAmount: pred.actual_amount ?? pred['actualAmount'] ?? 0,
            totalForecast: pred.total_forecast ?? pred['totalForecast'] ?? 0,
            exceedAmount: pred.exceed_amount ?? pred['exceedAmount'] ?? 0,
            willExceed: pred.will_exceed ?? pred['willExceed'] ?? false,
            exceedProbability:
              pred.exceed_probability ?? pred['exceedProbability'] ?? 0,
            confidence: pred.confidence ?? 0,
            trend: pred.trend ?? 'stable',
            riskLevel: (pred.risk_level || pred['riskLevel']) ?? 'low',
            actualRatio: pred.actual_ratio ?? pred['actualRatio'] ?? 0,
            forecastRatio: pred.forecast_ratio ?? pred['forecastRatio'] ?? 0,
            expectedTodayRatio:
              pred.expected_today_ratio ?? pred['expectedTodayRatio'] ?? null,
            expectedTodayAmount:
              pred.expected_today_amount ?? pred['expectedTodayAmount'] ?? null,
            dailyForecastAmount:
              pred.daily_forecast_amount ?? pred['dailyForecastAmount'] ?? null,
            isFrequent: pred.is_frequent ?? pred['isFrequent'] ?? false,
          })),
          summary: data.ai_budgeting.summary,
        }
      : null,
    goalAchievement,
    unpaidRecurring: (data.unpaid_recurring || []).map((item) => ({
      categoryName: item.category_name,
      description: item.description,
      expectedDay: item.expected_day ?? null,
      expectedAmount: item.expected_amount,
      status: item.status,
    })),
    habitSuggestions: (data.habit_suggestions || []).map((item) => ({
      habitName: item.habit_name,
      categoryName: item.category_name,
      currentMonthCount: item.current_month_count,
      currentMonthTotal: item.current_month_total,
      avgPerTransaction: item.avg_per_transaction,
      projectedMonthCount: item.projected_month_count,
      projectedMonthTotal: item.projected_month_total,
      suggestedCount: item.suggested_count,
      potentialSavings: item.potential_savings,
      suggestionText: item.suggestion_text,
      isEarlyEstimate: item.is_early_estimate ?? false,
    })),
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
    topDrivers: (forecast.top_drivers || forecast.topDrivers || []).map(
      (driver) => ({
        categoryName: driver.category_name || driver.categoryName,
        contributionAmount:
          driver.contribution_amount !== undefined
            ? driver.contribution_amount
            : driver.contributionAmount,
        contributionPct:
          driver.contribution_pct !== undefined
            ? driver.contribution_pct
            : driver.contributionPct,
        deltaVsBaseline:
          driver.delta_vs_baseline !== undefined
            ? driver.delta_vs_baseline
            : driver.deltaVsBaseline,
        trend: driver.trend || 'stable',
        reasonCodes: driver.reason_codes || driver.reasonCodes || [],
      }),
    ),
    deltaVsLastMonth:
      forecast.delta_vs_last_month !== undefined
        ? forecast.delta_vs_last_month
        : forecast.deltaVsLastMonth,
    deltaVsBaseline:
      forecast.delta_vs_baseline !== undefined
        ? forecast.delta_vs_baseline
        : forecast.deltaVsBaseline,
    confidenceFactors:
      forecast.confidence_factors || forecast.confidenceFactors || [],
    dataQualityWarnings:
      forecast.data_quality_warnings || forecast.dataQualityWarnings || [],
  };
}
