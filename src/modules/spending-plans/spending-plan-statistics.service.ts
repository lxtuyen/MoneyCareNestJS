import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { EstimatedExpense } from 'src/modules/estimated-expenses/entities/estimated-expense.entity';
import { SpendingPlan } from './entities/spending-plan.entity';
import {
  SpendingPlanExpenseFrequency,
  SpendingPlanStatus,
} from './interfaces/spending-plan.enums';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import {
  formatDateInTimeZone,
  formatDateParts,
  getDaysLeftInMonthPeriod,
  getReportDay,
  getVietnamMonthRange,
  getVietnamNow,
} from 'src/common/utils/date.util';
import { roundMoney } from 'src/common/utils/money.util';
import { DailySeriesItem } from './interfaces/spending-plan.interface';

@Injectable()
export class SpendingPlanStatisticsService {
  constructor(
    @InjectRepository(SpendingPlan)
    private readonly planRepo: Repository<SpendingPlan>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly calculator: SpendingPlanCalculatorService,
  ) {}

  async getActiveStatistics(userId: number) {
    const plan = await this.findActivePlanEntity(userId);
    if (!plan) {
      return this.ok(null);
    }

    const period = this.getCurrentPeriod();
    const context = await this.buildExpenseContext(plan, userId, period);
    const currentDay = getReportDay(period);
    const dailySeries = this.buildDailySeries(
      plan,
      context.dailySpentMap,
      1,
      currentDay,
      period,
    );

    const daysLeft = getDaysLeftInMonthPeriod(period);

    return this.ok({
      planId: plan.id,
      planName: this.getPlanDisplayName(),
      mealLimit: 0,
      availableSpendingAmount: plan.availableSpendingAmount,
      spentFlexibleAmount: context.spentFlexibleAmount,
      spentFixedAmount: context.spentFixedAmount,
      remainingAmount: context.remainingAmount,
      daysLeft,
      projectedEndBalance: context.projectedEndBalance,
      dailySeries,
      fixedExpenses: context.planItems,
    });
  }

  private async findActivePlanEntity(userId: number) {
    const plan = await this.planRepo.findOne({
      where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      relations: ['estimatedExpenses', 'user'],
      order: { activatedAt: 'DESC' },
    });
    if (plan) {
      this.applyCalculation(plan);
    }
    return plan;
  }

  public async buildExpenseContext(
    plan: SpendingPlan,
    userId: number,
    period = this.getCurrentPeriod(),
  ) {
    const { start, end } = getVietnamMonthRange(period.month, period.year);
    const allExpenses = await this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.subCategory', 'subCategory')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.transaction_date >= :start', { start })
      .andWhere('transaction.transaction_date <= :end', { end })
      .getMany();

    const expenses = allExpenses.filter((t) => !t.isTransfer);

    const dailySpentMap = new Map<string, number>();
    const todayKey = formatDateParts(
      period.year,
      period.month,
      getReportDay(period),
    );
    let spentFlexibleAmount = 0;
    let spentFixedAmount = 0;
    const planItemTotals = new Map<
      number,
      { spentThisMonth: number; todaySpent: number }
    >();

    for (const transaction of expenses) {
      const amount = Number(transaction.amount ?? 0);
      const transactionDateKey = formatDateInTimeZone(
        transaction.transaction_date,
      );
      let matchesPlanItem = false;

      for (const item of plan.estimatedExpenses ?? []) {
        const matchesSubCategory =
          item.subCategory?.id &&
          transaction.subCategory?.id === item.subCategory.id;
        const matchesCategory =
          !item.subCategory?.id &&
          item.category?.id &&
          transaction.category?.id === item.category.id;
        if (!matchesSubCategory && !matchesCategory) continue;

        const totals = planItemTotals.get(item.id) ?? {
          spentThisMonth: 0,
          todaySpent: 0,
        };
        totals.spentThisMonth += amount;
        if (transactionDateKey === todayKey) {
          totals.todaySpent += amount;
        }
        planItemTotals.set(item.id, totals);
        matchesPlanItem = true;
      }

      if (matchesPlanItem) {
        spentFixedAmount += amount;
        continue;
      }

      spentFlexibleAmount += amount;
      dailySpentMap.set(
        transactionDateKey,
        (dailySpentMap.get(transactionDateKey) ?? 0) + amount,
      );
    }

    const remainingAmount = roundMoney(
      plan.availableSpendingAmount - spentFlexibleAmount,
    );
    const daysPassed = Math.max(1, getReportDay(period));
    const daysInMonth = this.calculator.getDaysInMonth(
      period.month,
      period.year,
    );

    let totalAvgDailyFixed = 0;
    for (const item of plan.estimatedExpenses ?? []) {
      const totals = planItemTotals.get(item.id);
      const spent = totals?.spentThisMonth ?? 0;
      const freqType = item.frequencyType ?? SpendingPlanExpenseFrequency.ONCE;
      const amount = Number(item.amount ?? 0);
      const freqValue = Number(item.frequencyValue ?? 1);

      if (freqType === SpendingPlanExpenseFrequency.DAILY) {
        totalAvgDailyFixed +=
          spent > 0 ? spent / daysPassed : amount * freqValue;
      } else if (freqType === SpendingPlanExpenseFrequency.WEEKLY) {
        totalAvgDailyFixed +=
          spent > 0 ? spent / daysPassed : (amount * freqValue) / 7;
      } else {
        totalAvgDailyFixed +=
          spent > 0 ? spent / daysInMonth : (amount * freqValue) / daysInMonth;
      }
    }

    const avgDailyFlexible =
      daysPassed > 0 ? spentFlexibleAmount / daysPassed : 0;
    const totalAvgDaily = totalAvgDailyFixed + avgDailyFlexible;
    const projectedMonthlySpending = totalAvgDaily * daysInMonth;
    const projectedEndBalance = roundMoney(
      plan.totalAmount - projectedMonthlySpending,
    );

    return {
      dailySpentMap,
      spentFlexibleAmount: roundMoney(spentFlexibleAmount),
      spentFixedAmount: roundMoney(spentFixedAmount),
      remainingAmount,
      projectedEndBalance,
      planItems: (plan.estimatedExpenses ?? []).map((item) => {
        const totals = planItemTotals.get(item.id) ?? {
          spentThisMonth: 0,
          todaySpent: 0,
        };
        const monthlyLimit =
          Number(item.monthlyLimit || 0) ||
          this.resolveMonthlyLimit(item, period);
        const dailyLimit =
          item.dailyLimit == null ? null : Number(item.dailyLimit);
        const todaySpent = roundMoney(totals.todaySpent);
        return {
          ...item,
          monthlyLimit,
          dailyLimit,
          spentThisMonth: roundMoney(totals.spentThisMonth),
          todaySpent,
          monthlyProgress:
            monthlyLimit > 0
              ? Math.round((totals.spentThisMonth / monthlyLimit) * 1000) / 10
              : 0,
          dailyOverAmount:
            dailyLimit && todaySpent > dailyLimit
              ? roundMoney(todaySpent - dailyLimit)
              : 0,
        };
      }),
    };
  }

  private buildDailySeries(
    plan: SpendingPlan,
    dailySpentMap: Map<string, number>,
    startDay: number,
    endDay: number,
    period = this.getCurrentPeriod(),
  ): DailySeriesItem[] {
    const series: DailySeriesItem[] = [];

    for (let day = startDay; day <= endDay; day++) {
      const date = formatDateParts(period.year, period.month, day);
      const spent = roundMoney(dailySpentMap.get(date) ?? 0);
      series.push({
        date,
        spent,
      });
    }

    return series;
  }

  private resolveMonthlyLimit(
    item: EstimatedExpense,
    period: { month: number; year: number },
  ) {
    const amount = Number(item.amount || 0);
    const frequencyValue = Number(item.frequencyValue || 1);
    const frequencyType = item.frequencyType?.toLowerCase();

    if (frequencyType === 'daily') {
      return (
        amount *
        frequencyValue *
        this.calculator.getDaysInMonth(period.month, period.year)
      );
    }

    if (frequencyType === 'weekly') {
      return (
        amount *
        frequencyValue *
        (this.calculator.getDaysInMonth(period.month, period.year) / 7)
      );
    }

    return amount * frequencyValue;
  }

  private applyCalculation(plan: SpendingPlan) {
    const calculation = this.calculator.calculate({
      totalAmount: plan.totalAmount,
      savingTargetAmount: plan.savingTargetAmount,
      estimatedExpenses: plan.estimatedExpenses ?? [],
      ...this.getCurrentPeriod(),
    });

    Object.assign(plan, calculation);
  }

  private getCurrentPeriod() {
    const now = getVietnamNow();
    return {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };
  }

  private getPlanDisplayName(): string {
    return 'Kế hoạch chi tiêu';
  }

  private ok<T>(data: T): ApiResponse<T> {
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data,
    });
  }

  async getMonthlySavingCapacity(userId: number): Promise<{
    savingTargetAmount: number;
    projectedEndBalance: number;
    monthlySavingCapacity: number;
    totalAmount: number;
    fixedExpenseTotal: number;
    availableSpendingAmount: number;
  } | null> {
    let plan = await this.findActivePlanEntity(userId);
    if (!plan) {
      plan = await this.planRepo.findOne({
        where: {
          user: { id: userId },
          status: In([SpendingPlanStatus.DRAFT, SpendingPlanStatus.PAUSED]),
        },
        relations: ['estimatedExpenses', 'user'],
        order: { updatedAt: 'DESC' },
      });
      if (plan) {
        this.applyCalculation(plan);
      }
    }
    if (!plan) return null;

    const period = this.getCurrentPeriod();
    const context = await this.buildExpenseContext(plan, userId, period);

    const savingTargetAmount = Number(plan.savingTargetAmount ?? 0);
    const projectedEndBalance = context.projectedEndBalance;
    const monthlySavingCapacity = roundMoney(Math.max(0, projectedEndBalance));

    return {
      savingTargetAmount,
      projectedEndBalance,
      monthlySavingCapacity,
      totalAmount: Number(plan.totalAmount ?? 0),
      fixedExpenseTotal: Number(plan.estimatedExpenseTotal ?? 0),
      availableSpendingAmount: Number(plan.availableSpendingAmount ?? 0),
    };
  }
}
