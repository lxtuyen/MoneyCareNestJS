import {
  AnalyticsMappedAiBudgeting,
  AnalyticsMappedResponse,
} from 'src/modules/analytics/types/analytics-service-response.type';
import {
  GoalAchievementPredictionDto,
  GoalAchievementPredictionSummaryDto,
} from 'src/modules/saving-goals/dto/goal-achievement-prediction.dto';

export type SavingGoalAnalyticsContext = {
  available: boolean;
  projectedMonthlySavings: number;
  currentMonthlySavingRate: number;
  confidence: number;
  forecastRiskLevel: string;
  aiBudgeting: AnalyticsMappedAiBudgeting | null;
  goalAchievement: GoalAchievementPredictionSummaryDto | null;
  planId: number | null;
  monthlySavingCapacity: number;
};

export type GoalReadinessSnapshot = {
  isFeasible: boolean;
  status: string;
  monthsEstimate: number;
  shortfallAmount: number;
  reasonCodes: string[];
};

export type GoalBudgetRecommendationItem = {
  recommendationId: string;
  planId?: number;
  planItemId?: number;
  categoryId?: number;
  categoryName: string;
  currentLimitAmount: number;
  recommendedLimitAmount: number;
  predictedSpendAmount: number;
  riskBefore: string;
  riskAfter: string;
  confidence: number;
  elasticity: string;
  reasonCodes: string[];
  actionType: string;
  canApply: boolean;
  spentAmount: number;
  adjustmentAmount: number;
  explanation?: string;
};

export function buildSavingGoalAnalyticsContext(
  analytics: AnalyticsMappedResponse | null | undefined,
  fallbackMonthlySavingCapacity: number,
): SavingGoalAnalyticsContext {
  const forecasting = analytics?.forecasting;
  const currentProjection = forecasting?.currentMonthProjection;
  const nextProjection = forecasting?.nextMonthForecast;
  const plannedIncome = Number(
    analytics?.aiBudgeting?.recommendedTotalBudget || 0,
  );
  const forecastedExpense = Number(
    nextProjection?.totalForecast ??
      currentProjection?.totalForecast ??
      analytics?.monthlyForecast ??
      0,
  );
  const projectedFromForecast = Math.max(
    0,
    plannedIncome > 0
      ? plannedIncome - forecastedExpense
      : fallbackMonthlySavingCapacity,
  );

  const primaryPrediction = resolvePrimaryGoalPrediction(
    analytics?.goalAchievement ?? null,
  );
  const projectedMonthlySavings = Math.max(
    0,
    primaryPrediction?.projectedMonthlySavingRate ??
      projectedFromForecast ??
      fallbackMonthlySavingCapacity,
  );
  const currentMonthlySavingRate = Math.max(
    0,
    primaryPrediction?.currentMonthlySavingRate ??
      analytics?.aiBudgeting?.expectedSavingsAmount ??
      fallbackMonthlySavingCapacity,
  );

  const planId =
    analytics?.aiBudgeting?.items?.find((item) => item.planId)?.planId ?? null;

  return {
    available: !!analytics,
    projectedMonthlySavings,
    currentMonthlySavingRate,
    confidence: Math.max(
      0,
      Math.min(
        1,
        primaryPrediction?.confidence ??
          analytics?.aiBudgeting?.confidence ??
          currentProjection?.confidence ??
          0.5,
      ),
    ),
    forecastRiskLevel:
      currentProjection?.riskLevel ??
      nextProjection?.riskLevel ??
      analytics?.budgetRisk?.riskLevel ??
      'medium',
    aiBudgeting: analytics?.aiBudgeting ?? null,
    goalAchievement: analytics?.goalAchievement ?? null,
    planId,
    monthlySavingCapacity: Math.max(0, fallbackMonthlySavingCapacity),
  };
}

export function resolveEffectiveMonthlySavings(
  context: SavingGoalAnalyticsContext,
): number {
  if (context.monthlySavingCapacity > 0) {
    return context.monthlySavingCapacity;
  }
  if (context.projectedMonthlySavings > 0) {
    return context.projectedMonthlySavings;
  }
  if (context.currentMonthlySavingRate > 0) {
    return context.currentMonthlySavingRate;
  }
  return 0;
}

export function resolvePrimaryGoalPrediction(
  goalAchievement: GoalAchievementPredictionSummaryDto | null,
): GoalAchievementPredictionDto | null {
  if (!goalAchievement) return null;
  if (goalAchievement.highestRiskGoal) {
    return goalAchievement.highestRiskGoal;
  }
  if (goalAchievement.nearestGoal) {
    return goalAchievement.nearestGoal;
  }
  return goalAchievement.predictions?.[0] ?? null;
}

export function filterGoalBudgetRecommendations(
  aiBudgeting: AnalyticsMappedAiBudgeting | null,
): GoalBudgetRecommendationItem[] {
  if (!aiBudgeting?.items?.length) return [];

  return aiBudgeting.items
    .filter((item) => {
      const hasGoalPressure = (item.reasonCodes || []).includes(
        'saving_goal_pressure',
      );
      const isDecrease =
        item.actionType === 'decrease' &&
        item.recommendedLimitAmount < item.currentLimitAmount;

      // Chỉ hiển thị khi có thay đổi đáng kể (>= 5%)
      const hasMeaningfulChange =
        item.currentLimitAmount <= 0 ||
        Math.abs(item.recommendedLimitAmount - item.currentLimitAmount) /
          item.currentLimitAmount >=
          0.05;

      return (hasGoalPressure || isDecrease) && hasMeaningfulChange;
    })
    .map((item) => ({
      recommendationId: item.recommendationId,
      planId: item.planId,
      planItemId: item.planItemId,
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      currentLimitAmount: item.currentLimitAmount,
      recommendedLimitAmount: item.recommendedLimitAmount,
      predictedSpendAmount: item.predictedSpendAmount,
      riskBefore: item.riskBefore,
      riskAfter: item.riskAfter,
      confidence: item.confidence,
      elasticity: item.elasticity,
      reasonCodes: item.reasonCodes,
      actionType: item.actionType,
      canApply: item.canApply,
      spentAmount: item.spentAmount,
      adjustmentAmount: item.adjustmentAmount,
      explanation: item.explanation || item.reason,
    }));
}

export function buildGoalReadinessForNewGoal(
  remainingTarget: number,
  monthsEstimate: number,
  effectiveMonthlySavings: number,
  confidence: number,
): GoalReadinessSnapshot {
  const requiredMonthlySaving =
    monthsEstimate > 0 ? remainingTarget / monthsEstimate : remainingTarget;
  const shortfallAmount = Math.max(
    0,
    requiredMonthlySaving - effectiveMonthlySavings,
  );
  const isFeasible =
    effectiveMonthlySavings > 0 &&
    (shortfallAmount <= 0 || shortfallAmount / requiredMonthlySaving <= 0.15);

  let status = 'on_track';
  const reasonCodes: string[] = [];

  if (effectiveMonthlySavings <= 0) {
    status = 'unlikely';
    reasonCodes.push('negative_cash_flow');
  } else if (shortfallAmount > 0) {
    status =
      shortfallAmount / requiredMonthlySaving > 0.3
        ? 'at_risk'
        : 'slightly_at_risk';
    reasonCodes.push('saving_velocity_below_required');
  } else {
    reasonCodes.push('saving_velocity_above_required');
  }

  if (confidence < 0.45) {
    reasonCodes.push('insufficient_data');
  }

  return {
    isFeasible,
    status,
    monthsEstimate,
    shortfallAmount: Math.round(shortfallAmount),
    reasonCodes,
  };
}

export function mapAiBudgetingToProposalItems(
  aiBudgeting: AnalyticsMappedAiBudgeting | null,
  suggestedMonthlySaving: number,
): {
  totalAmount: number;
  budgetItems: Array<{
    categoryId?: number;
    categoryName: string;
    amount: number;
    monthlyLimit: number;
  }>;
} | null {
  if (!aiBudgeting?.items?.length) return null;

  const budgetItems = aiBudgeting.items
    .filter((item) => item.recommendedLimitAmount > 0)
    .map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      amount: Math.round(item.recommendedLimitAmount),
      monthlyLimit: Math.round(item.recommendedLimitAmount),
    }));

  if (!budgetItems.length) return null;

  const recommendedBudget = Math.round(
    aiBudgeting.recommendedTotalBudget ||
      budgetItems.reduce((sum, item) => sum + item.monthlyLimit, 0),
  );

  return {
    totalAmount:
      recommendedBudget + Math.max(0, Math.round(suggestedMonthlySaving)),
    budgetItems,
  };
}

export function buildAnalyticsProposalExtras(
  context: SavingGoalAnalyticsContext,
  goalReadiness: GoalReadinessSnapshot,
): Record<string, unknown> {
  return {
    analyticsSource: context.available
      ? 'analytics-service'
      : 'spending-plan-fallback',
    projectedMonthlySavings: context.projectedMonthlySavings,
    currentMonthlySavingRate: context.currentMonthlySavingRate,
    confidence: context.confidence,
    forecastRiskLevel: context.forecastRiskLevel,
    budgetStrategy: context.aiBudgeting
      ? 'ai_budget_optimizer'
      : 'template-fallback',
    goalReadiness,
  };
}
