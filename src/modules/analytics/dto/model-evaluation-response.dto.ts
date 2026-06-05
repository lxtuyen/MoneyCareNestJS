/**
 * DTO cho Model Evaluation API responses.
 */

export class ForecastingSummaryDto {
  evaluatedRuns: number;
  latestModelName: string;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  directionalAccuracy: number | null;
  lastEvaluatedAt: Date | null;
}

export class BudgetingSummaryDto {
  evaluatedRuns: number;
  adoptionRate: number | null;
  overrunRate: number | null;
  averageOverrunAmount: number | null;
  lastEvaluatedAt: Date | null;
}

export class ModelEvaluationSummaryDto {
  forecasting: ForecastingSummaryDto | null;
  budgeting: BudgetingSummaryDto | null;
}

export class ForecastingRecentRunDto {
  runId: number;
  modelName: string;
  predictedTotal: number;
  actualTotal: number;
  absoluteError: number;
  absolutePercentageError: number;
  evaluatedAt: Date;
}

export class CategoryMetricDto {
  categoryName: string;
  mape: number;
  evaluatedRuns: number;
}

export class ForecastingEvaluationDetailDto {
  summary: ForecastingSummaryDto;
  recentRuns: ForecastingRecentRunDto[];
  categoryMetrics: CategoryMetricDto[];
}

export class BudgetingRecentRunDto {
  runId: number;
  recommendedTotalBudget: number;
  actualTotalExpense: number;
  overrunAmount: number;
  wasOverBudget: boolean;
}

export class BudgetingEvaluationDetailDto {
  summary: BudgetingSummaryDto;
  recentRuns: BudgetingRecentRunDto[];
}
