import { BadRequestException } from '@nestjs/common';
import { ScenarioBudgetRisk } from '../dto/scenario-simulation-response.dto';

export interface ScenarioDelta {
  monthlyIncomeChange: number;
  monthlyExpenseChange: number;
  monthlySaving: number;
  oneTimeCashOutflow: number;
  categoryDeltas: Record<string, number>;
  reasonCodes: string[];
}

export interface BaselineRiskInput {
  monthlyIncome: number;
  monthlyExpense: number;
  planLimit?: number | null;
  fallbackRisk?: ScenarioBudgetRisk | string | null;
}

export function emptyDelta(): ScenarioDelta {
  return {
    monthlyIncomeChange: 0,
    monthlyExpenseChange: 0,
    monthlySaving: 0,
    oneTimeCashOutflow: 0,
    categoryDeltas: {},
    reasonCodes: [],
  };
}

export function calculateFrequencyReduction(input: {
  currentFrequencyPerWeek: number;
  newFrequencyPerWeek: number;
  averageAmount: number;
  itemName?: string;
}): ScenarioDelta {
  assertPositive(input.averageAmount, 'averageAmount');
  assertNonNegative(input.currentFrequencyPerWeek, 'currentFrequencyPerWeek');
  assertNonNegative(input.newFrequencyPerWeek, 'newFrequencyPerWeek');
  if (input.newFrequencyPerWeek > input.currentFrequencyPerWeek) {
    throw new BadRequestException(
      'newFrequencyPerWeek must be less than or equal to currentFrequencyPerWeek',
    );
  }

  const weeklySaving =
    (input.currentFrequencyPerWeek - input.newFrequencyPerWeek) *
    input.averageAmount;
  const monthlySaving = roundMoney(weeklySaving * 4.345);

  return {
    ...emptyDelta(),
    monthlyExpenseChange: -monthlySaving,
    monthlySaving,
    reasonCodes: ['frequency_reduction', 'monthly_saving_increased'],
  };
}

export function calculateCategoryReduction(input: {
  categoryName: string;
  monthlyReductionAmount: number;
}): ScenarioDelta {
  const categoryName = requireText(input.categoryName, 'categoryName');
  assertPositive(input.monthlyReductionAmount, 'monthlyReductionAmount');

  return {
    ...emptyDelta(),
    monthlyExpenseChange: -roundMoney(input.monthlyReductionAmount),
    monthlySaving: roundMoney(input.monthlyReductionAmount),
    categoryDeltas: {
      [categoryName]: -roundMoney(input.monthlyReductionAmount),
    },
    reasonCodes: ['category_reduction_feasible', 'monthly_saving_increased'],
  };
}

export function calculateIncomeDrop(input: {
  monthlyIncome: number;
  incomeDropPct?: number;
  incomeDropAmount?: number;
}): ScenarioDelta {
  if (
    (input.incomeDropPct === undefined || input.incomeDropPct === null) &&
    (input.incomeDropAmount === undefined || input.incomeDropAmount === null)
  ) {
    throw new BadRequestException(
      'incomeDropPct or incomeDropAmount is required',
    );
  }

  let dropAmount = 0;
  if (input.incomeDropPct !== undefined && input.incomeDropPct !== null) {
    assertPositive(input.incomeDropPct, 'incomeDropPct');
    if (input.incomeDropPct >= 100) {
      throw new BadRequestException('incomeDropPct must be less than 100');
    }
    dropAmount = input.monthlyIncome * (input.incomeDropPct / 100);
  } else {
    assertPositive(input.incomeDropAmount ?? 0, 'incomeDropAmount');
    dropAmount = input.incomeDropAmount ?? 0;
  }

  const monthlyIncomeChange = -roundMoney(dropAmount);
  return {
    ...emptyDelta(),
    monthlyIncomeChange,
    monthlySaving: monthlyIncomeChange,
    reasonCodes: ['monthly_income_decreased'],
  };
}

export function calculateOneTimePurchase(input: {
  amount: number;
  categoryName?: string;
}): ScenarioDelta {
  assertPositive(input.amount, 'amount');
  const categoryName = input.categoryName
    ? requireText(input.categoryName, 'categoryName')
    : undefined;
  const amount = roundMoney(input.amount);

  return {
    ...emptyDelta(),
    monthlyExpenseChange: amount,
    monthlySaving: -amount,
    oneTimeCashOutflow: amount,
    categoryDeltas: categoryName ? { [categoryName]: amount } : {},
    reasonCodes: ['one_time_purchase_impact'],
  };
}

export function resolveBudgetRisk(
  input: BaselineRiskInput,
): ScenarioBudgetRisk {
  const planLimit = Number(input.planLimit ?? 0);
  if (planLimit > 0) {
    const ratio = input.monthlyExpense / planLimit;
    if (ratio >= 1) return 'high';
    if (ratio >= 0.85) return 'medium';
    return 'low';
  }

  if (input.monthlyIncome > 0) {
    const savingRate =
      (input.monthlyIncome - input.monthlyExpense) / input.monthlyIncome;
    if (savingRate < 0) return 'high';
    if (savingRate < 0.1) return 'medium';
    return 'low';
  }

  if (
    input.fallbackRisk === 'low' ||
    input.fallbackRisk === 'medium' ||
    input.fallbackRisk === 'high'
  ) {
    return input.fallbackRisk;
  }

  return 'medium';
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

export function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function optionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return toNumber(value);
}

export function requireText(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException(`${fieldName} is required`);
  }
  return value.trim();
}

function assertPositive(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestException(`${fieldName} must be greater than 0`);
  }
}

function assertNonNegative(value: number, fieldName: string) {
  if (!Number.isFinite(value) || value < 0) {
    throw new BadRequestException(
      `${fieldName} must be greater than or equal to 0`,
    );
  }
}
