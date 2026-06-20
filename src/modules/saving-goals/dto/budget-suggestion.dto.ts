export class BudgetSuggestionGoalDto {
  id: number;
  name: string;
  monthlyBudget: number;
}

export class BudgetSuggestionResponseDto {
  averageMonthlySavings: number;
  totalExistingBudget: number;
  availableSavings: number;
  requiredMonthly: number;
  isSufficient: boolean;
  deficit: number;
  existingGoals: BudgetSuggestionGoalDto[];
  confidenceScore: number;
}
