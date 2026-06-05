import { Expose } from 'class-transformer';

export class PersonalFinanceProfileResponseDto {
  @Expose()
  id!: number;

  @Expose()
  userId!: number;

  @Expose()
  periodStart!: Date;

  @Expose()
  periodEnd!: Date;

  @Expose()
  generatedAt!: Date;

  @Expose()
  averageMonthlyIncome!: number;

  @Expose()
  averageMonthlyExpense!: number;

  @Expose()
  averageMonthlySavings!: number;

  @Expose()
  savingsRate!: number;

  @Expose()
  expenseVolatilityScore!: number;

  @Expose()
  budgetDisciplineScore!: number;

  @Expose()
  financialHealthScore!: number;

  @Expose()
  riskLevel!: 'low' | 'medium' | 'high';

  @Expose()
  spendingStyle!:
    | 'stable'
    | 'impulsive'
    | 'seasonal'
    | 'goal_driven'
    | 'income_driven'
    | 'insufficient_data';

  @Expose()
  topExpenseCategories!: any[];

  @Expose()
  essentialCategories!: any[];

  @Expose()
  recurringExpenseHints!: any[];

  @Expose()
  frequentExpenseDays!: any[];

  @Expose()
  monthlyIncomeTrend!: 'increasing' | 'stable' | 'decreasing';

  @Expose()
  monthlyExpenseTrend!: 'increasing' | 'stable' | 'decreasing';

  @Expose()
  preferredBudgetBufferPct!: number;

  @Expose()
  confidenceScore!: number;

  @Expose()
  feedbackSummary!: Record<string, any>;

  @Expose()
  profileVersion!: string;
}
