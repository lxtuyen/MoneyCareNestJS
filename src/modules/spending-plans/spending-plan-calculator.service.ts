import { Injectable } from '@nestjs/common';
import { SpendingPlanRiskLevel } from './interfaces/spending-plan.enums';
import { roundMoney } from 'src/common/utils/money.util';
import {
  SpendingPlanCalculationExpense,
  SpendingPlanCalculationInput,
  SpendingPlanCalculationResult,
} from './interfaces/spending-plan-calculation.interface';

@Injectable()
export class SpendingPlanCalculatorService {
  calculate(
    input: SpendingPlanCalculationInput,
  ): SpendingPlanCalculationResult {
    const totalAmount = Number(input.totalAmount ?? 0);
    const savingTargetAmount = Number(input.savingTargetAmount ?? 0);
    const daysInMonth = this.getDaysInMonth(input.month, input.year);

    let estimatedExpenseTotal = 0;
    const estimatedExpenses: SpendingPlanCalculationExpense[] =
      input.estimatedExpenses ?? [];

    for (const expense of estimatedExpenses) {
      const amount = Number(expense.amount ?? 0);
      const freqType = expense.frequencyType ?? 'once';
      const freqValue = expense.frequencyValue ?? 1;

      switch (freqType) {
        case 'daily':
          estimatedExpenseTotal += amount * freqValue * daysInMonth;
          break;
        case 'weekly':
          estimatedExpenseTotal += amount * freqValue * (daysInMonth / 7);
          break;
        case 'monthly':
        case 'once':
        default:
          estimatedExpenseTotal += amount * freqValue;
          break;
      }
    }

    const availableSpendingAmount =
      totalAmount - estimatedExpenseTotal - savingTargetAmount;

    return {
      estimatedExpenseTotal: roundMoney(estimatedExpenseTotal),
      availableSpendingAmount: roundMoney(availableSpendingAmount),
      riskLevel: this.calculateRiskLevel(
        totalAmount,
        estimatedExpenseTotal,
        savingTargetAmount,
        availableSpendingAmount,
      ),
    };
  }

  getDaysInMonth(month: number, year: number): number {
    return new Date(year, month, 0).getDate();
  }

  private calculateRiskLevel(
    totalAmount: number,
    estimatedExpenseTotal: number,
    savingTargetAmount: number,
    availableSpendingAmount: number,
  ): SpendingPlanRiskLevel {
    if (totalAmount <= 0 || availableSpendingAmount <= 0) {
      return SpendingPlanRiskLevel.DANGER;
    }

    const committedRatio =
      (estimatedExpenseTotal + savingTargetAmount) / totalAmount;
    if (committedRatio >= 0.9) {
      return SpendingPlanRiskLevel.DANGER;
    }

    if (committedRatio >= 0.75) {
      return SpendingPlanRiskLevel.WARNING;
    }

    return SpendingPlanRiskLevel.SAFE;
  }
}
