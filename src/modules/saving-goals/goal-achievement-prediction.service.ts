import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { PersonalFinanceProfile } from 'src/modules/personalization/entities/personal-finance-profile.entity';
import { PersonalizationService } from 'src/modules/personalization/personalization.service';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import {
  formatDateInTimeZone,
  getVietnamNow,
} from 'src/common/utils/date.util';
import { SavingGoal } from './entities/saving-goal.entity';
import {
  GoalAchievementPredictionDto,
  GoalAchievementPredictionSummaryDto,
  GoalAchievementRiskLevel,
  GoalAchievementStatus,
  GoalRecommendedActionDto,
} from './dto/goal-achievement-prediction.dto';

type SavingVelocitySource =
  | 'goal_contribution_history'
  | 'profile_average_savings'
  | 'spending_plan_capacity'
  | 'net_balance_fallback'
  | 'insufficient_data';

type SavingCapacity = Awaited<
  ReturnType<SpendingPlansService['getMonthlySavingCapacity']>
>;

interface UserPredictionContext {
  activeGoals: SavingGoal[];
  transactions: Transaction[];
  profile: PersonalFinanceProfile | null;
  capacity: SavingCapacity;
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  fallbackMonthlySavings: number;
  activeMonths: number;
  totalRemainingAmount: number;
}

interface VelocityResult {
  currentMonthlySavingRate: number;
  projectedMonthlySavingRate: number;
  source: SavingVelocitySource;
  hasGoalContributionHistory: boolean;
}

export interface GoalPredictionOverrides {
  monthlySavingDelta?: number;
  oneTimeOutflow?: number;
  newTargetAmount?: number;
  newDeadline?: Date | string | null;
}

@Injectable()
export class GoalAchievementPredictionService {
  constructor(
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly personalizationService: PersonalizationService,
    private readonly spendingPlansService: SpendingPlansService,
  ) {}

  async predictGoal(
    userId: number,
    goalId: number,
  ): Promise<GoalAchievementPredictionDto> {
    const goal = await this.goalRepo.findOne({
      where: { id: goalId, user: { id: userId } },
      relations: ['wallet', 'user'],
    });
    if (!goal) {
      throw new NotFoundException('Saving goal not found');
    }

    const context = await this.buildUserContext(userId);
    return this.calculatePrediction(goal, context);
  }

  async predictGoalWithOverrides(
    userId: number,
    goalId: number,
    overrides: GoalPredictionOverrides,
  ): Promise<GoalAchievementPredictionDto> {
    const goal = await this.goalRepo.findOne({
      where: { id: goalId, user: { id: userId } },
      relations: ['wallet', 'user'],
    });
    if (!goal) {
      throw new NotFoundException('Saving goal not found');
    }

    const context = await this.buildUserContext(userId);
    return this.calculatePrediction(goal, context, overrides);
  }

  async predictAllGoals(
    userId: number,
  ): Promise<GoalAchievementPredictionSummaryDto> {
    const goals = await this.goalRepo.find({
      where: { user: { id: userId }, is_completed: false },
      relations: ['wallet', 'user'],
      order: { updated_at: 'DESC' },
    });

    const context = await this.buildUserContext(userId, ...goals);
    const predictions = goals.map((goal) =>
      this.calculatePrediction(goal, context),
    );

    return {
      totalGoals: predictions.length,
      onTrackGoals: predictions.filter((p) => p.status === 'on_track').length,
      atRiskGoals: predictions.filter((p) =>
        ['slightly_at_risk', 'at_risk'].includes(p.status),
      ).length,
      offTrackGoals: predictions.filter((p) =>
        ['off_track', 'overdue', 'unlikely'].includes(p.status),
      ).length,
      nearestGoal: this.findNearestGoal(predictions),
      highestRiskGoal: this.findHighestRiskGoal(predictions),
      predictions,
    };
  }

  private async buildUserContext(
    userId: number,
    ...goals: SavingGoal[]
  ): Promise<UserPredictionContext> {
    const periodStart = getVietnamNow();
    periodStart.setDate(periodStart.getDate() - 180);

    const [transactions, profile, capacity, activeGoals] = await Promise.all([
      this.transactionRepo
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.category', 'category')
        .leftJoinAndSelect('t.wallet', 'wallet')
        .where('t.userId = :userId', { userId })
        .andWhere('t.transaction_date >= :periodStart', { periodStart })
        .orderBy('t.transaction_date', 'ASC')
        .getMany(),
      this.personalizationService.getOrBuildProfile(userId).catch(() => null),
      this.spendingPlansService.getMonthlySavingCapacity(userId),
      goals.length > 0
        ? Promise.resolve(goals)
        : this.goalRepo.find({
            where: { user: { id: userId }, is_completed: false },
            relations: ['wallet', 'user'],
          }),
    ]);

    const simpleAverages = this.calculateSimpleAverages(transactions);
    const totalRemainingAmount = activeGoals.reduce((sum, goal) => {
      return sum + this.getRemainingAmount(goal);
    }, 0);

    return {
      activeGoals,
      transactions,
      profile,
      capacity,
      averageMonthlyIncome: simpleAverages.averageMonthlyIncome,
      averageMonthlyExpense: simpleAverages.averageMonthlyExpense,
      fallbackMonthlySavings: simpleAverages.averageMonthlySavings,
      activeMonths: simpleAverages.activeMonths,
      totalRemainingAmount,
    };
  }

  private calculatePrediction(
    goal: SavingGoal,
    context: UserPredictionContext,
    overrides: GoalPredictionOverrides = {},
  ): GoalAchievementPredictionDto {
    const now = getVietnamNow();
    const baseTargetAmount = this.roundMoney(Number(goal.target ?? 0));
    const targetAmount = this.roundMoney(
      Number(overrides.newTargetAmount ?? baseTargetAmount) +
        Math.max(0, Number(overrides.oneTimeOutflow ?? 0)),
    );
    const savedAmount = this.roundMoney(
      Number(goal.wallet?.balance ?? goal.saved_amount ?? 0),
    );
    const remainingAmount = Math.max(0, targetAmount - savedAmount);
    const overrideDeadline =
      overrides.newDeadline === undefined
        ? undefined
        : overrides.newDeadline
          ? new Date(overrides.newDeadline)
          : null;
    const deadline =
      overrideDeadline !== undefined
        ? overrideDeadline
          ? this.startOfDay(overrideDeadline)
          : null
        : goal.end_date
          ? this.startOfDay(goal.end_date)
          : null;
    const daysRemainingToDeadline = deadline
      ? Math.ceil(
          (deadline.getTime() - this.startOfDay(now).getTime()) / this.dayMs,
        )
      : null;

    const requiredRates = this.calculateRequiredSavingRates(
      remainingAmount,
      daysRemainingToDeadline,
    );
    const velocity = this.calculateCurrentSavingVelocity(
      goal,
      context,
      overrides,
    );
    const predictedDaysToComplete =
      remainingAmount <= 0
        ? 0
        : velocity.currentMonthlySavingRate > 0
          ? Math.ceil(
              (remainingAmount / velocity.currentMonthlySavingRate) * 30,
            )
          : null;
    const predictedCompletionDate =
      predictedDaysToComplete === null
        ? null
        : this.addDays(now, predictedDaysToComplete);
    const daysDifference =
      predictedCompletionDate && deadline
        ? Math.ceil(
            (this.startOfDay(predictedCompletionDate).getTime() -
              deadline.getTime()) /
              this.dayMs,
          )
        : null;
    const status = this.resolveGoalStatus({
      remainingAmount,
      daysRemainingToDeadline,
      currentMonthlySavingRate: velocity.currentMonthlySavingRate,
      daysDifference,
      hasDeadline: !!deadline,
    });
    const riskLevel = this.resolveRiskLevel(status);
    const shortfallAmount = Math.max(
      0,
      requiredRates.requiredMonthlySavingRate -
        velocity.currentMonthlySavingRate,
    );
    const surplusAmount = Math.max(
      0,
      velocity.currentMonthlySavingRate -
        requiredRates.requiredMonthlySavingRate,
    );
    const confidence = this.calculateConfidence(context, velocity, goal);
    const reasonCodes = this.buildReasonCodes({
      status,
      riskLevel,
      shortfallAmount,
      surplusAmount,
      daysRemainingToDeadline,
      velocity,
      context,
    });

    return {
      goalId: goal.id,
      name: goal.name,
      targetAmount,
      savedAmount,
      remainingAmount: this.roundMoney(remainingAmount),
      startDate: goal.start_date ? this.formatDate(goal.start_date) : null,
      deadline: deadline ? this.formatDate(deadline) : null,
      predictedCompletionDate: predictedCompletionDate
        ? this.formatDate(predictedCompletionDate)
        : null,
      daysRemainingToDeadline,
      predictedDaysToComplete,
      daysDifference,
      status,
      riskLevel,
      progressPct:
        targetAmount > 0
          ? Math.min(100, Math.round((savedAmount / targetAmount) * 100))
          : 0,
      currentMonthlySavingRate: this.roundMoney(
        velocity.currentMonthlySavingRate,
      ),
      projectedMonthlySavingRate: this.roundMoney(
        velocity.projectedMonthlySavingRate,
      ),
      requiredMonthlySavingRate: this.roundMoney(
        requiredRates.requiredMonthlySavingRate,
      ),
      requiredWeeklySavingRate: this.roundMoney(
        requiredRates.requiredWeeklySavingRate,
      ),
      requiredDailySavingRate: this.roundMoney(
        requiredRates.requiredDailySavingRate,
      ),
      shortfallAmount: this.roundMoney(shortfallAmount),
      surplusAmount: this.roundMoney(surplusAmount),
      confidence,
      reasonCodes,
      recommendedActions: this.buildRecommendedActions({
        status,
        shortfallAmount,
        daysDifference,
        predictedCompletionDate,
        context,
      }),
      supportingData: {
        averageMonthlyIncome: this.roundMoney(
          context.profile?.averageMonthlyIncome ?? context.averageMonthlyIncome,
        ),
        averageMonthlyExpense: this.roundMoney(
          context.profile?.averageMonthlyExpense ??
            context.averageMonthlyExpense,
        ),
        averageMonthlySavings: this.roundMoney(
          context.profile?.averageMonthlySavings ??
            context.fallbackMonthlySavings,
        ),
        forecastedMonthlyExpense: this.roundMoney(
          context.capacity?.fixedExpenseTotal ?? 0,
        ),
        deadline: deadline ? this.formatDate(deadline) : null,
        remainingAmount: this.roundMoney(remainingAmount),
        savingVelocitySource: velocity.source,
        activeMonths: Math.round(context.activeMonths * 10) / 10,
      },
    };
  }

  private calculateRequiredSavingRates(
    remainingAmount: number,
    daysRemainingToDeadline: number | null,
  ) {
    if (remainingAmount <= 0 || daysRemainingToDeadline === null) {
      return {
        requiredDailySavingRate: 0,
        requiredWeeklySavingRate: 0,
        requiredMonthlySavingRate: 0,
      };
    }

    if (daysRemainingToDeadline <= 0) {
      return {
        requiredDailySavingRate: remainingAmount,
        requiredWeeklySavingRate: remainingAmount,
        requiredMonthlySavingRate: remainingAmount,
      };
    }

    const monthsRemainingToDeadline = Math.max(
      daysRemainingToDeadline / 30.4,
      1 / 30.4,
    );
    const requiredDailySavingRate = remainingAmount / daysRemainingToDeadline;

    return {
      requiredDailySavingRate,
      requiredWeeklySavingRate: requiredDailySavingRate * 7,
      requiredMonthlySavingRate: remainingAmount / monthsRemainingToDeadline,
    };
  }

  private calculateCurrentSavingVelocity(
    goal: SavingGoal,
    context: UserPredictionContext,
    overrides: GoalPredictionOverrides = {},
  ): VelocityResult {
    const goalContribution = this.calculateGoalContributionRate(
      goal,
      context.transactions,
    );
    if (goalContribution > 0) {
      return this.applyVelocityOverrides(
        {
          currentMonthlySavingRate: goalContribution,
          projectedMonthlySavingRate: goalContribution,
          source: 'goal_contribution_history',
          hasGoalContributionHistory: true,
        },
        overrides,
      );
    }

    const profileSavings = Number(context.profile?.averageMonthlySavings ?? 0);
    const spendingPlanSavings = Number(
      context.capacity?.monthlySavingCapacity ?? 0,
    );
    const fallbackSavings = context.fallbackMonthlySavings;

    let baseMonthlySavingRate = 0;
    let source: SavingVelocitySource = 'insufficient_data';

    if (profileSavings > 0) {
      baseMonthlySavingRate = profileSavings;
      source = 'profile_average_savings';
    } else if (spendingPlanSavings > 0) {
      baseMonthlySavingRate = spendingPlanSavings;
      source = 'spending_plan_capacity';
    } else if (fallbackSavings > 0) {
      baseMonthlySavingRate = fallbackSavings;
      source = 'net_balance_fallback';
    }

    const allocationWeight = this.calculateGoalAllocationWeight(goal, context);
    const currentMonthlySavingRate = Math.max(
      0,
      baseMonthlySavingRate * allocationWeight,
    );
    const projectedBase =
      spendingPlanSavings > 0 ? spendingPlanSavings : baseMonthlySavingRate;

    return this.applyVelocityOverrides(
      {
        currentMonthlySavingRate,
        projectedMonthlySavingRate: Math.max(
          0,
          projectedBase * allocationWeight,
        ),
        source,
        hasGoalContributionHistory: false,
      },
      overrides,
    );
  }

  private applyVelocityOverrides(
    velocity: VelocityResult,
    overrides: GoalPredictionOverrides,
  ): VelocityResult {
    const monthlySavingDelta = Number(overrides.monthlySavingDelta ?? 0);
    if (!Number.isFinite(monthlySavingDelta) || monthlySavingDelta === 0) {
      return velocity;
    }

    return {
      ...velocity,
      currentMonthlySavingRate: Math.max(
        0,
        velocity.currentMonthlySavingRate + monthlySavingDelta,
      ),
      projectedMonthlySavingRate: Math.max(
        0,
        velocity.projectedMonthlySavingRate + monthlySavingDelta,
      ),
    };
  }

  private calculateGoalContributionRate(
    goal: SavingGoal,
    transactions: Transaction[],
  ): number {
    const walletId = goal.wallet?.id;
    if (!walletId) return 0;

    const walletTransactions = transactions.filter(
      (transaction) => transaction.wallet?.id === walletId,
    );
    if (walletTransactions.length === 0) return 0;

    const netContribution = walletTransactions.reduce((sum, transaction) => {
      const amount = Number(transaction.amount ?? 0);
      return transaction.type === 'income' ? sum + amount : sum - amount;
    }, 0);

    if (netContribution <= 0) return 0;
    return netContribution / this.calculateActiveMonths(walletTransactions);
  }

  private calculateGoalAllocationWeight(
    goal: SavingGoal,
    context: UserPredictionContext,
  ): number {
    const activeGoals = context.activeGoals.filter(
      (item) => !item.is_completed,
    );
    if (activeGoals.length <= 1 || context.totalRemainingAmount <= 0) return 1;

    return this.getRemainingAmount(goal) / context.totalRemainingAmount;
  }

  private resolveGoalStatus(input: {
    remainingAmount: number;
    daysRemainingToDeadline: number | null;
    currentMonthlySavingRate: number;
    daysDifference: number | null;
    hasDeadline: boolean;
  }): GoalAchievementStatus {
    if (input.remainingAmount <= 0) return 'completed';
    if (
      input.daysRemainingToDeadline !== null &&
      input.daysRemainingToDeadline < 0
    ) {
      return 'overdue';
    }
    if (input.currentMonthlySavingRate <= 0) return 'unlikely';
    if (!input.hasDeadline) return 'tracking';
    if (input.daysDifference === null) return 'unlikely';
    if (input.daysDifference <= 0) return 'on_track';
    if (input.daysDifference <= 14) return 'slightly_at_risk';
    if (input.daysDifference <= 45) return 'at_risk';
    return 'off_track';
  }

  private resolveRiskLevel(
    status: GoalAchievementStatus,
  ): GoalAchievementRiskLevel {
    if (['completed', 'on_track', 'tracking'].includes(status)) return 'low';
    if (['slightly_at_risk', 'at_risk'].includes(status)) return 'medium';
    return 'high';
  }

  private calculateConfidence(
    context: UserPredictionContext,
    velocity: VelocityResult,
    goal: SavingGoal,
  ): number {
    let confidence = 0.5;

    if (context.activeMonths >= 3) confidence += 0.15;
    if (context.activeMonths >= 6) confidence += 0.1;

    const profileConfidence = Number(context.profile?.confidenceScore ?? 0);
    if (profileConfidence > 0) {
      confidence = confidence * 0.6 + (profileConfidence / 100) * 0.4;
    }

    if (context.capacity) {
      confidence = confidence * 0.85 + 0.65 * 0.15;
    }

    if (velocity.hasGoalContributionHistory) confidence += 0.05;
    if (velocity.currentMonthlySavingRate <= 0) confidence -= 0.1;

    const goalAgeDays = goal.start_date
      ? Math.max(
          0,
          Math.ceil(
            (getVietnamNow().getTime() - goal.start_date.getTime()) /
              this.dayMs,
          ),
        )
      : 0;
    if (goalAgeDays >= 30) confidence += 0.03;

    return Math.max(0.25, Math.min(0.95, Math.round(confidence * 100) / 100));
  }

  private buildReasonCodes(input: {
    status: GoalAchievementStatus;
    riskLevel: GoalAchievementRiskLevel;
    shortfallAmount: number;
    surplusAmount: number;
    daysRemainingToDeadline: number | null;
    velocity: VelocityResult;
    context: UserPredictionContext;
  }): string[] {
    const codes = new Set<string>();

    if (input.status === 'completed') codes.add('goal_already_completed');
    if (input.velocity.currentMonthlySavingRate <= 0)
      codes.add('negative_cash_flow');
    if (input.surplusAmount > 0) codes.add('saving_velocity_above_required');
    if (input.shortfallAmount > 0) codes.add('saving_velocity_below_required');
    if (input.context.activeMonths < 1) codes.add('insufficient_data');
    if (
      Number(input.context.profile?.budgetDisciplineScore ?? 100) > 0 &&
      Number(input.context.profile?.budgetDisciplineScore ?? 100) < 60
    ) {
      codes.add('budget_discipline_low');
    }
    if (
      input.context.capacity &&
      input.context.capacity.fixedExpenseTotal >
        input.context.capacity.totalAmount * 0.7
    ) {
      codes.add('fixed_expenses_too_high');
    }

    if (input.daysRemainingToDeadline !== null) {
      if (input.daysRemainingToDeadline <= 30) {
        codes.add('deadline_pressure_high');
      } else if (input.daysRemainingToDeadline <= 90) {
        codes.add('deadline_pressure_medium');
      } else {
        codes.add('deadline_pressure_low');
      }
    }

    if (input.riskLevel === 'high' && input.shortfallAmount <= 0) {
      codes.add('insufficient_data');
    }

    return Array.from(codes);
  }

  private buildRecommendedActions(input: {
    status: GoalAchievementStatus;
    shortfallAmount: number;
    daysDifference: number | null;
    predictedCompletionDate: Date | null;
    context: UserPredictionContext;
  }): GoalRecommendedActionDto[] {
    if (['completed', 'on_track', 'tracking'].includes(input.status)) {
      return [
        {
          actionType: 'keep_current_plan',
          message: 'Giữ tốc độ tiết kiệm hiện tại để hoàn thành đúng hạn.',
        },
      ];
    }

    const actions: GoalRecommendedActionDto[] = [];
    if (input.shortfallAmount > 0) {
      const amount = this.roundMoney(input.shortfallAmount);
      actions.push({
        actionType: 'increase_monthly_saving',
        amount,
        message: `Tăng tiết kiệm thêm khoảng ${amount.toLocaleString('vi-VN')} VND/tháng để kịp hạn.`,
      });
    }

    const flexibleCategory = this.findFlexibleCutCategory(input.context);
    if (
      flexibleCategory &&
      ['slightly_at_risk', 'at_risk', 'off_track', 'unlikely'].includes(
        input.status,
      )
    ) {
      const amount = this.roundMoney(
        Math.min(
          Math.max(input.shortfallAmount, 100000),
          flexibleCategory.amount * 0.2,
        ),
      );
      if (amount > 0) {
        actions.push({
          actionType: 'reduce_expense',
          categoryName: flexibleCategory.name,
          amount,
          message: `Giảm ${flexibleCategory.name} khoảng ${amount.toLocaleString('vi-VN')} VND/tháng để tăng khả năng hoàn thành mục tiêu.`,
          impactDays: input.daysDifference
            ? Math.max(1, Math.min(30, Math.round(input.daysDifference * 0.4)))
            : undefined,
        });
      }
    }

    if (input.predictedCompletionDate && input.daysDifference !== null) {
      actions.push({
        actionType: 'extend_deadline',
        suggestedDeadline: this.formatDate(input.predictedCompletionDate),
        message: `Nếu giữ tốc độ hiện tại, nên dời hạn sang ${this.formatDateForUser(input.predictedCompletionDate)}.`,
      });
    }

    if (actions.length === 0) {
      actions.push({
        actionType: 'lower_target',
        message:
          'Cân nhắc giảm mục tiêu hoặc bổ sung dữ liệu thu chi để hệ thống dự báo chính xác hơn.',
      });
    }

    return actions.slice(0, 3);
  }

  private calculateSimpleAverages(transactions: Transaction[]) {
    const currentMonthKey = formatDateInTimeZone(getVietnamNow()).slice(0, 7);
    const monthlyTotals = new Map<
      string,
      { income: number; expense: number }
    >();

    for (const transaction of transactions) {
      if (transaction.isTransfer || !transaction.transaction_date) continue;

      const monthKey = formatDateInTimeZone(transaction.transaction_date).slice(
        0,
        7,
      );
      if (monthKey === currentMonthKey) continue;

      const current = monthlyTotals.get(monthKey) ?? {
        income: 0,
        expense: 0,
      };
      const amount = Number(transaction.amount ?? 0);

      if (transaction.type === 'income') {
        current.income += amount;
      } else if (transaction.type === 'expense') {
        current.expense += amount;
      }

      monthlyTotals.set(monthKey, current);
    }

    const months = Array.from(monthlyTotals.values());
    if (months.length === 0) {
      return {
        averageMonthlyIncome: 0,
        averageMonthlyExpense: 0,
        averageMonthlySavings: 0,
        activeMonths: 0,
      };
    }

    const activeMonths = months.length;
    const totalIncome = months.reduce((sum, month) => sum + month.income, 0);
    const totalExpense = months.reduce((sum, month) => sum + month.expense, 0);
    const averageMonthlyIncome = totalIncome / activeMonths;
    const averageMonthlyExpense = totalExpense / activeMonths;

    return {
      averageMonthlyIncome,
      averageMonthlyExpense,
      averageMonthlySavings: averageMonthlyIncome - averageMonthlyExpense,
      activeMonths,
    };
  }

  private calculateActiveMonths(transactions: Transaction[]): number {
    if (transactions.length === 0) return 0;
    const timestamps = transactions
      .map((transaction) => transaction.transaction_date?.getTime())
      .filter((value): value is number => typeof value === 'number');
    if (timestamps.length === 0) return 1;

    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps, getVietnamNow().getTime());
    const days = Math.max(1, Math.ceil((last - first) / this.dayMs) + 1);
    return Math.max(1, days / 30.4);
  }

  private getRemainingAmount(goal: SavingGoal): number {
    const target = Number(goal.target ?? 0);
    const saved = Number(goal.wallet?.balance ?? goal.saved_amount ?? 0);
    return Math.max(0, target - saved);
  }

  private findNearestGoal(predictions: GoalAchievementPredictionDto[]) {
    return (
      predictions
        .filter((prediction) => prediction.deadline)
        .sort(
          (a, b) =>
            new Date(a.deadline as string).getTime() -
            new Date(b.deadline as string).getTime(),
        )[0] ?? null
    );
  }

  private findHighestRiskGoal(predictions: GoalAchievementPredictionDto[]) {
    const score: Record<GoalAchievementRiskLevel, number> = {
      high: 3,
      medium: 2,
      low: 1,
    };
    return (
      [...predictions].sort((a, b) => {
        const riskDiff = score[b.riskLevel] - score[a.riskLevel];
        if (riskDiff !== 0) return riskDiff;
        return (b.daysDifference ?? -9999) - (a.daysDifference ?? -9999);
      })[0] ?? null
    );
  }

  private findFlexibleCutCategory(context: UserPredictionContext) {
    const categories = context.profile?.topExpenseCategories ?? [];
    const first = categories.find(
      (category: any) => Number(category.amount) > 0,
    );
    if (!first) return null;

    return {
      name: first.name?.toString() || 'chi tiêu linh hoạt',
      amount: Number(first.amount ?? 0),
    };
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private formatDate(date: Date): string {
    return formatDateInTimeZone(date);
  }

  private formatDateForUser(date: Date): string {
    return new Intl.DateTimeFormat('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  }

  private roundMoney(value: number): number {
    return Math.round(Number.isFinite(value) ? value : 0);
  }

  private get dayMs(): number {
    return 24 * 60 * 60 * 1000;
  }
}
