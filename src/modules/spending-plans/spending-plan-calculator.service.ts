import { Injectable } from '@nestjs/common';
import {
  SpendingPlanRiskLevel,
  SpendingPlanExpenseFrequency,
} from './interfaces/spending-plan.enums';
import { roundMoney } from 'src/common/utils/money.util';
import {
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

    let fixedExpenseTotal = 0;
    for (const expense of input.fixedExpenses ?? []) {
      const amount = Number(expense.amount ?? 0);
      const freqType =
        expense.frequencyType ?? SpendingPlanExpenseFrequency.ONCE;
      const freqValue = expense.frequencyValue ?? 1;

      switch (freqType) {
        case SpendingPlanExpenseFrequency.DAILY:
          fixedExpenseTotal += amount * freqValue * daysInMonth;
          break;
        case SpendingPlanExpenseFrequency.WEEKLY:
          fixedExpenseTotal += amount * freqValue * (daysInMonth / 7);
          break;
        case SpendingPlanExpenseFrequency.MONTHLY:
        case SpendingPlanExpenseFrequency.ONCE:
        default:
          fixedExpenseTotal += amount * freqValue;
          break;
      }
    }

    const availableSpendingAmount =
      totalAmount - fixedExpenseTotal - savingTargetAmount;

    return {
      fixedExpenseTotal: roundMoney(fixedExpenseTotal),
      availableSpendingAmount: roundMoney(availableSpendingAmount),
      riskLevel: this.calculateRiskLevel(
        totalAmount,
        fixedExpenseTotal,
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
    fixedExpenseTotal: number,
    savingTargetAmount: number,
    availableSpendingAmount: number,
  ): SpendingPlanRiskLevel {
    if (totalAmount <= 0 || availableSpendingAmount <= 0) {
      return SpendingPlanRiskLevel.DANGER;
    }

    const committedRatio =
      (fixedExpenseTotal + savingTargetAmount) / totalAmount;
    if (committedRatio >= 0.9) {
      return SpendingPlanRiskLevel.DANGER;
    }

    if (committedRatio >= 0.75) {
      return SpendingPlanRiskLevel.WARNING;
    }

    return SpendingPlanRiskLevel.SAFE;
  }
}
