import { computeForecastedMonthlySavings } from './forecasted-monthly-savings.helper';

describe('computeForecastedMonthlySavings', () => {
  it('uses planned income minus category forecasts when predictions exist', () => {
    const result = computeForecastedMonthlySavings({
      plannedIncome: 12000000,
      totalSpent: 7000000,
      planCategoryNames: ['Ăn uống', 'Di chuyển'],
      budgetExceedPredictions: [
        { categoryName: 'Ăn uống', totalForecast: 8500000 },
        { categoryName: 'Di chuyển', totalForecast: 1200000 },
      ],
    });

    expect(result).toBe(2300000);
  });

  it('allows negative savings when spending forecast exceeds planned income', () => {
    const result = computeForecastedMonthlySavings({
      plannedIncome: 3000000,
      totalSpent: 1880000,
      planCategoryNames: ['Ăn uống'],
      budgetExceedPredictions: [
        { categoryName: 'Ăn uống', totalForecast: 3610283 },
      ],
    });

    expect(result).toBe(-610283);
  });

  it('falls back to planned income minus spent when forecasts are unavailable', () => {
    const result = computeForecastedMonthlySavings({
      plannedIncome: 12000000,
      totalSpent: 7000000,
      projectedEndBalance: 4500000,
    });

    expect(result).toBe(5000000);
  });
});
