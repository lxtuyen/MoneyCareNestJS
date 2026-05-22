import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { ok } from 'src/common/utils/response.util';
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
      return ok(null);
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

    return ok({
      planId: plan.id,
      planName: this.getPlanDisplayName(),
      mealLimit: 0,
      totalAmount: plan.totalAmount,
      availableSpendingAmount: plan.availableSpendingAmount,
      spentAmount: context.spentAmount,
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
    let spentAmount = 0;
    const planItemTotals = new Map<
      number,
      { spentThisMonth: number; todaySpent: number }
    >();

    for (const transaction of expenses) {
      const amount = Number(transaction.amount ?? 0);
      const transactionDateKey = formatDateInTimeZone(
        transaction.transaction_date,
      );

      spentAmount += amount;
      dailySpentMap.set(
        transactionDateKey,
        (dailySpentMap.get(transactionDateKey) ?? 0) + amount,
      );

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
      }
    }

    const remainingAmount = roundMoney(
      plan.totalAmount - spentAmount,
    );
    const daysPassed = Math.max(1, getReportDay(period));
    const daysInMonth = this.calculator.getDaysInMonth(
      period.month,
      period.year,
    );

    const avgDaily = daysPassed > 0 ? spentAmount / daysPassed : 0;
    const projectedMonthlySpending = avgDaily * daysInMonth;
    const projectedEndBalance = roundMoney(
      plan.totalAmount - projectedMonthlySpending,
    );

    return {
      dailySpentMap,
      spentAmount: roundMoney(spentAmount),
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

  async getMonthlySavingCapacity(userId: number): Promise<{
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

    const projectedEndBalance = context.projectedEndBalance;
    const monthlySavingCapacity = roundMoney(Math.max(0, projectedEndBalance));

    return {
      projectedEndBalance,
      monthlySavingCapacity,
      totalAmount: Number(plan.totalAmount ?? 0),
      fixedExpenseTotal: Number(plan.estimatedExpenseTotal ?? 0),
      availableSpendingAmount: Number(plan.availableSpendingAmount ?? 0),
    };
  }
}
