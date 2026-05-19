import { Injectable } from '@nestjs/common';
import {
  SpendingPlanRiskLevel,
  SpendingPlanExpenseFrequency,
  SpendingPlanTrackingType,
} from './entities/spending-plan.enums';

export interface SpendingPlanCalculationInput {
  totalAmount: number;
  savingTargetAmount?: number | null;
  fixedExpenses?: Array<{
    amount: number | null | undefined;
    frequencyType?: SpendingPlanExpenseFrequency;
    frequencyValue?: number;
    trackingType?: SpendingPlanTrackingType;
  }> | null;
  month: number;
  year: number;
}

export interface SpendingPlanCalculationResult {
  fixedExpenseTotal: number;
  availableSpendingAmount: number;
  riskLevel: SpendingPlanRiskLevel;
}

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
      const freqType = expense.frequencyType ?? SpendingPlanExpenseFrequency.ONCE;
      const freqValue = expense.frequencyValue ?? 1;

      switch (freqType) {
        case SpendingPlanExpenseFrequency.DAILY:
          fixedExpenseTotal += amount * freqValue * daysInMonth;
          break;
        case SpendingPlanExpenseFrequency.WEEKLY:
          // Estimate 4.33 weeks per month or (daysInMonth / 7)
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
    const positiveAvailableAmount = Math.max(0, availableSpendingAmount);

    return {
      fixedExpenseTotal: this.roundMoney(fixedExpenseTotal),
      availableSpendingAmount: this.roundMoney(availableSpendingAmount),
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
      (fixedExpenseTotal + savingTargetAmount) /
      totalAmount;
    if (committedRatio >= 0.9) {
      return SpendingPlanRiskLevel.DANGER;
    }

    if (committedRatio >= 0.75) {
      return SpendingPlanRiskLevel.WARNING;
    }

    return SpendingPlanRiskLevel.SAFE;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
