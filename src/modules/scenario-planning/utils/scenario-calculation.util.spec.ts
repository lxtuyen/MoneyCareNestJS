import { BadRequestException } from '@nestjs/common';
import {
  calculateFrequencyReduction,
  calculateIncomeDrop,
  calculateOneTimePurchase,
  resolveBudgetRisk,
} from './scenario-calculation.util';

describe('scenario calculation util', () => {
  it('calculates reduce_frequency_expense monthly saving', () => {
    const result = calculateFrequencyReduction({
      currentFrequencyPerWeek: 5,
      newFrequencyPerWeek: 2,
      averageAmount: 30000,
    });

    expect(result.monthlySaving).toBe(391050);
    expect(result.monthlyExpenseChange).toBe(-391050);
  });

  it('calculates income_drop from percentage', () => {
    const result = calculateIncomeDrop({
      monthlyIncome: 10000000,
      incomeDropPct: 20,
    });

    expect(result.monthlyIncomeChange).toBe(-2000000);
    expect(result.monthlySaving).toBe(-2000000);
  });

  it('calculates one_time_purchase as current-month cash impact', () => {
    const result = calculateOneTimePurchase({
      amount: 5000000,
      categoryName: 'Shopping',
    });

    expect(result.oneTimeCashOutflow).toBe(5000000);
    expect(result.monthlySaving).toBe(-5000000);
    expect(result.monthlyExpenseChange).toBe(5000000);
  });

  it('rejects negative amounts and invalid frequencies', () => {
    expect(() => calculateOneTimePurchase({ amount: -1 })).toThrow(
      BadRequestException,
    );
    expect(() =>
      calculateFrequencyReduction({
        currentFrequencyPerWeek: 2,
        newFrequencyPerWeek: 5,
        averageAmount: 30000,
      }),
    ).toThrow(BadRequestException);
  });

  it('resolves budget risk from plan limit', () => {
    expect(
      resolveBudgetRisk({
        monthlyIncome: 12000000,
        monthlyExpense: 8500000,
        planLimit: 10000000,
      }),
    ).toBe('medium');
    expect(
      resolveBudgetRisk({
        monthlyIncome: 12000000,
        monthlyExpense: 11000000,
        planLimit: 10000000,
      }),
    ).toBe('high');
  });
});
