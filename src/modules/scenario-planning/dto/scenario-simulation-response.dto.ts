import { ScenarioType } from './simulate-scenario.dto';

export type ScenarioBudgetRisk = 'low' | 'medium' | 'high';
export type ScenarioActionPriority = 'low' | 'medium' | 'high';

export class ScenarioGoalImpactDto {
  goalId!: number;
  goalName!: string;
  currentPredictedCompletionDate!: string | null;
  newPredictedCompletionDate!: string | null;
  impactDays!: number | null;
  impactText!: string;
  currentStatus!: string;
  newStatus!: string;
  currentMonthlySavingRate!: number;
  newMonthlySavingRate!: number;
  requiredMonthlySavingRate!: number;
  newRequiredMonthlySavingRate!: number;
  currentDaysDifference!: number | null;
  newDaysDifference!: number | null;
}

export class ScenarioRecommendedActionDto {
  actionType!: string;
  categoryName?: string;
  amount?: number;
  message!: string;
  priority!: ScenarioActionPriority;
}

export class ScenarioTemplateFieldDto {
  name!: string;
  type!: 'text' | 'number' | 'money' | 'percent' | 'date';
  label!: string;
  required!: boolean;
}

export class ScenarioTemplateDto {
  scenarioType!: ScenarioType;
  title!: string;
  description!: string;
  fields!: ScenarioTemplateFieldDto[];
}

export class ScenarioSimulationResponseDto {
  scenarioId!: string;
  scenarioType!: ScenarioType;
  title!: string;
  summary!: string;
  monthlySaving!: number;
  monthlyExpenseChange!: number;
  monthlyIncomeChange!: number;
  expectedSavingsAfter!: number;
  budgetRiskBefore!: ScenarioBudgetRisk;
  budgetRiskAfter!: ScenarioBudgetRisk;
  goalImpacts!: ScenarioGoalImpactDto[];
  recommendedActions!: ScenarioRecommendedActionDto[];
  confidence!: number;
  reasonCodes!: string[];
  supportingData!: Record<string, unknown>;
  createdAt!: string;
}
