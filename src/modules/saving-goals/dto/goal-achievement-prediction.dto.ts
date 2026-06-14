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
  | 'keep_current_plan'
  | 'transfer_from_wallet';

export class GoalRecommendedActionDto {
  actionType!: GoalRecommendedActionType;
  amount?: number;
  categoryName?: string;
  suggestedDeadline?: string;
  /** Wallet to transfer FROM (only for transfer_from_wallet action) */
  walletId?: number;
  walletName?: string;
  message!: string;
  impactDays?: number;
}

export class GoalAchievementNextMonthPredictionDto {
  targetAmount!: number;
  savedAmount!: number;
  remainingAmount!: number;
  startDate!: string;
  deadline!: string;
  predictedCompletionDate!: string | null;
  status!: GoalAchievementStatus;
  riskLevel!: GoalAchievementRiskLevel;
  daysDifference!: number | null;
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
  nextMonthPrediction!: GoalAchievementNextMonthPredictionDto | null;
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
