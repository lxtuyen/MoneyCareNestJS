import {
  SpendingPlanExpenseFrequency,
  SpendingPlanRiskLevel,
  SpendingPlanTrackingType,
} from './spending-plan.enums';

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
