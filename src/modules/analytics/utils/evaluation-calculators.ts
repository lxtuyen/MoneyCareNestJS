import { PredictedActualPair } from './model-metrics.util';

// ── Types ──

export interface ForecastingCategoryMetric {
  categoryName: string;
  predictedAmount: number;
  actualAmount: number;
  absoluteError: number;
  absolutePercentageError: number | null;
}

export interface ForecastingEvaluationResult {
  actualTotalExpense: number;
  predictedTotal: number;
  dailyPairs: PredictedActualPair[];
  categoryMetrics: ForecastingCategoryMetric[];
  dailyActual: Record<string, number>;
  categoryActual: Record<string, number>;
}

export interface BudgetingCategoryDetail {
  categoryName: string;
  recommendedLimit: number;
  predictedSpend: number;
  actualSpend: number;
  overrunAmount: number;
  wasOverBudget: boolean;
}

export interface BudgetingEvaluationResult {
  actualTotalExpense: number;
  recommendedTotal: number;
  overrunRate: number;
  adoptionRate: number;
  averageOverrunAmount: number;
  categoryDetails: BudgetingCategoryDetail[];
  categoryActual: Record<string, number>;
}

// ── Transaction helpers ──

export interface TransactionForEvaluation {
  amount: number | string;
  transaction_date: Date | string;
  category?: { name?: string } | null;
}

export function aggregateDailyExpenses(
  transactions: TransactionForEvaluation[],
): Record<string, number> {
  const daily: Record<string, number> = {};
  for (const t of transactions) {
    const dateStr = new Date(t.transaction_date).toISOString().split('T')[0];
    daily[dateStr] = (daily[dateStr] || 0) + Number(t.amount || 0);
  }
  return daily;
}

export function aggregateCategoryExpenses(
  transactions: TransactionForEvaluation[],
): Record<string, number> {
  const categoryMap: Record<string, number> = {};
  for (const t of transactions) {
    const catName = t.category?.name || 'Khác';
    categoryMap[catName] = (categoryMap[catName] || 0) + Number(t.amount || 0);
  }
  return categoryMap;
}

// ── Forecasting evaluation ──

export function calculateForecastingMetrics(
  payload: Record<string, any>,
  transactions: TransactionForEvaluation[],
): ForecastingEvaluationResult {
  const actualTotalExpense = transactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0,
  );

  const dailyActual = aggregateDailyExpenses(transactions);
  const categoryActual = aggregateCategoryExpenses(transactions);

  const predictedTotal: number = payload.totalForecast || 0;

  // Daily pairs
  const dailyPairs: PredictedActualPair[] = [];
  if (payload.dailyPoints && Array.isArray(payload.dailyPoints)) {
    for (const dp of payload.dailyPoints) {
      const actual = dailyActual[dp.date] || 0;
      dailyPairs.push({ predicted: dp.predictedAmount || 0, actual });
    }
  }

  // Category metrics
  const categoryMetrics: ForecastingCategoryMetric[] = [];
  if (payload.categoryForecasts && Array.isArray(payload.categoryForecasts)) {
    for (const cf of payload.categoryForecasts) {
      const actual = categoryActual[cf.categoryName] || 0;
      const predicted = cf.predictedAmount || 0;
      const ape =
        actual > 0
          ? (Math.abs(predicted - actual) / actual) * 100
          : predicted > 0
            ? 100
            : null;

      categoryMetrics.push({
        categoryName: cf.categoryName,
        predictedAmount: predicted,
        actualAmount: actual,
        absoluteError: Math.abs(actual - predicted),
        absolutePercentageError:
          ape !== null ? Math.round(ape * 100) / 100 : null,
      });
    }
  }

  return {
    actualTotalExpense,
    predictedTotal,
    dailyPairs,
    categoryMetrics,
    dailyActual,
    categoryActual,
  };
}

// ── Budgeting evaluation ──

export function calculateBudgetingMetrics(
  payload: Record<string, any>,
  transactions: TransactionForEvaluation[],
): BudgetingEvaluationResult {
  const actualTotalExpense = transactions.reduce(
    (sum, t) => sum + Number(t.amount || 0),
    0,
  );

  const categoryActual = aggregateCategoryExpenses(transactions);
  const recommendedTotal: number = payload.recommendedTotalBudget || 0;
  const items: any[] = payload.items || [];

  let overrunCount = 0;
  let totalOverrunAmount = 0;
  let adoptedCount = 0;
  const categoryDetails: BudgetingCategoryDetail[] = [];

  for (const item of items) {
    const actual = categoryActual[item.categoryName] || 0;
    const recommended: number = item.recommendedLimitAmount || 0;
    const overrun = actual > recommended ? actual - recommended : 0;

    if (overrun > 0) {
      overrunCount++;
      totalOverrunAmount += overrun;
    }

    if (
      recommended > 0 &&
      Math.abs(actual - recommended) / recommended <= 0.1
    ) {
      adoptedCount++;
    }

    categoryDetails.push({
      categoryName: item.categoryName,
      recommendedLimit: recommended,
      predictedSpend: item.predictedSpendAmount || 0,
      actualSpend: actual,
      overrunAmount: overrun,
      wasOverBudget: overrun > 0,
    });
  }

  const overrunRate = items.length > 0 ? overrunCount / items.length : 0;
  const adoptionRate = items.length > 0 ? adoptedCount / items.length : 0;
  const averageOverrunAmount =
    overrunCount > 0 ? totalOverrunAmount / overrunCount : 0;

  return {
    actualTotalExpense,
    recommendedTotal,
    overrunRate,
    adoptionRate,
    averageOverrunAmount,
    categoryDetails,
    categoryActual,
  };
}
