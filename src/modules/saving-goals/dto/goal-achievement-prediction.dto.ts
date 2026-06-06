export type GoalAchievementStatus =
  | 'completed'
  | 'on_track'
  | 'slightly_at_risk'
  | 'at_risk'
  | 'off_track'
  | 'overdue'
  | 'unlikely'
  | 'tracking';

export type GoalAchievementRiskLevel = 'low' | 'medium' | 'high';

export type GoalRecommendedActionType =
  | 'increase_monthly_saving'
  | 'reduce_expense'
  | 'extend_deadline'
  | 'lower_target'
  | 'keep_current_plan';

export class GoalRecommendedActionDto {
  actionType!: GoalRecommendedActionType;
  amount?: number;
  categoryName?: string;
  suggestedDeadline?: string;
  message!: string;
  impactDays?: number;
}

export class GoalAchievementPredictionDto {
  goalId!: number;
  name!: string;
  targetAmount!: number;
  savedAmount!: number;
  remainingAmount!: number;
  startDate!: string | null;
  deadline!: string | null;
  predictedCompletionDate!: string | null;
  daysRemainingToDeadline!: number | null;
  predictedDaysToComplete!: number | null;
  daysDifference!: number | null;
  status!: GoalAchievementStatus;
  riskLevel!: GoalAchievementRiskLevel;
  progressPct!: number;
  currentMonthlySavingRate!: number;
  projectedMonthlySavingRate!: number;
  requiredMonthlySavingRate!: number;
  requiredWeeklySavingRate!: number;
  requiredDailySavingRate!: number;
  shortfallAmount!: number;
  surplusAmount!: number;
  confidence!: number;
  reasonCodes!: string[];
  recommendedActions!: GoalRecommendedActionDto[];
  supportingData!: Record<string, unknown>;
}

export class GoalAchievementPredictionSummaryDto {
  totalGoals!: number;
  onTrackGoals!: number;
  atRiskGoals!: number;
  offTrackGoals!: number;
  nearestGoal!: GoalAchievementPredictionDto | null;
  highestRiskGoal!: GoalAchievementPredictionDto | null;
  predictions!: GoalAchievementPredictionDto[];
}
