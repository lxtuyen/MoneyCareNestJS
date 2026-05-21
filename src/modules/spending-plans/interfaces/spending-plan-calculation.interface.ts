import { SpendingPlanRiskLevel } from './spending-plan.enums';

export type SpendingPlanCalculationFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'once';

export interface SpendingPlanCalculationExpense {
  amount: number | null | undefined;
  frequencyType?: SpendingPlanCalculationFrequency;
  frequencyValue?: number | null;
}

export interface SpendingPlanCalculationInput {
  totalAmount: number;
  savingTargetAmount?: number | null;
  estimatedExpenses?: SpendingPlanCalculationExpense[] | null;
  month: number;
  year: number;
}

export interface SpendingPlanCalculationResult {
  estimatedExpenseTotal: number;
  availableSpendingAmount: number;
  riskLevel: SpendingPlanRiskLevel;
}
