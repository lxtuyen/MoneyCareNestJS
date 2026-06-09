export type BudgetExceedPredictionLite = {
  categoryName: string;
  totalForecast: number;
};

export type ForecastedMonthlySavingsInput = {
  plannedIncome: number;
  totalSpent: number;
  projectedEndBalance?: number | null;
  planCategoryNames?: string[];
  budgetExceedPredictions?: BudgetExceedPredictionLite[];
};

/**
 * Tính "Tiết kiệm dự kiến tháng này" theo đúng công thức:
 *   plannedIncome - tổng(totalForecast theo danh mục)
 *
 * Giống BudgetTrackingSection, kết quả có thể âm (chi > thu).
 */
export function computeForecastedMonthlySavings(
  input: ForecastedMonthlySavingsInput,
): number {
  const plannedIncome = Number(input.plannedIncome || 0);

  if (plannedIncome <= 0) {
    return 0;
  }

  const predictions = input.budgetExceedPredictions ?? [];
  if (predictions.length > 0) {
    const predictionMap = new Map(
      predictions.map((item) => [
        item.categoryName.trim().toLowerCase(),
        Number(item.totalForecast || 0),
      ]),
    );

    const categoryNames = input.planCategoryNames?.length
      ? input.planCategoryNames
      : predictions.map((item) => item.categoryName);

    let totalForecast = 0;
    for (const name of categoryNames) {
      const key = name.trim().toLowerCase();
      if (predictionMap.has(key)) {
        totalForecast += predictionMap.get(key) ?? 0;
      }
    }

    if (totalForecast > 0) {
      // Giữ nguyên dấu âm — khớp với BudgetTrackingSection
      return plannedIncome - totalForecast;
    }
  }

  if (Number(input.totalSpent || 0) > 0) {
    return plannedIncome - Number(input.totalSpent);
  }

  if (input.projectedEndBalance != null) {
    return Number(input.projectedEndBalance);
  }

  return 0;
}
