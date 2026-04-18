import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildInsightsCacheKey,
  FinancialInsightPeriod,
} from 'src/common/cache/financial-cache.util';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import {
  FinancialInsightSnapshot,
  InsightCategorySummary,
} from './types/ai.types';

type DateRange = {
  start: Date;
  end: Date;
};

type CategorySpendRow = {
  categoryName: string | null;
  categoryIcon: string | null;
  total: string;
};

const INSIGHTS_TTL_SECONDS = 180;

@Injectable()
export class FinancialInsightsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,
    private readonly cacheService: CacheService,
  ) {}

  async getInsights(
    userId: number,
    goalId?: number,
    period: FinancialInsightPeriod = 'last_30_days',
  ): Promise<FinancialInsightSnapshot> {
    const resolvedGoalId =
      goalId ?? (await this.getSelectedGoalId(userId)) ?? 0;
    const cacheKey = buildInsightsCacheKey(userId, resolvedGoalId, period);
    const cached =
      await this.cacheService.get<FinancialInsightSnapshot>(cacheKey);
    if (cached) {
      return cached;
    }

    const currentRange = this.getDateRange(period);
    const previousRange = this.getPreviousRange(period, currentRange);

    const [currentTotals, previousTotals] = await Promise.all([
      this.getTotals(userId, resolvedGoalId, currentRange),
      this.getTotals(userId, resolvedGoalId, previousRange),
    ]);

    const topCategories = await this.getTopCategories(
      userId,
      resolvedGoalId,
      currentRange,
      previousRange,
      currentTotals.expenseTotal,
    );

    const comparisonPrevMonth = {
      incomeChangePct: this.calculatePercentageChange(
        currentTotals.incomeTotal,
        previousTotals.incomeTotal,
      ),
      expenseChangePct: this.calculatePercentageChange(
        currentTotals.expenseTotal,
        previousTotals.expenseTotal,
      ),
      netBalanceChangePct: this.calculatePercentageChange(
        currentTotals.netBalance,
        previousTotals.netBalance,
      ),
    };

    const insights: FinancialInsightSnapshot = {
      period,
      generatedAt: new Date().toISOString(),
      incomeTotal: currentTotals.incomeTotal,
      expenseTotal: currentTotals.expenseTotal,
      netBalance: currentTotals.netBalance,
      dailyAverage: currentTotals.dailyAverage,
      topCategories,
      alerts: this.buildAlerts(
        currentTotals,
        comparisonPrevMonth,
        topCategories,
      ),
      comparisonPrevMonth,
    };

    await this.cacheService.set(cacheKey, insights, INSIGHTS_TTL_SECONDS);
    return insights;
  }

  async getSelectedGoalId(userId: number): Promise<number | null> {
    const selected = await this.goalRepo.findOne({
      where: { user: { id: userId }, is_selected: true },
      order: { updated_at: 'DESC' },
    });
    if (selected) return selected.id;

    const fallback = await this.goalRepo.findOne({
      where: { user: { id: userId } },
      order: { updated_at: 'DESC' },
    });

    return fallback?.id ?? null;
  }

  private getDateRange(period: FinancialInsightPeriod): DateRange {
    const now = new Date();

    if (period === 'this_month') {
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
      };
    }

    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    start.setHours(0, 0, 0, 0);

    return { start, end: now };
  }

  private getPreviousRange(
    period: FinancialInsightPeriod,
    currentRange: DateRange,
  ): DateRange {
    if (period === 'this_month') {
      const previousMonthEnd = new Date(
        currentRange.start.getFullYear(),
        currentRange.start.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );

      return {
        start: new Date(
          previousMonthEnd.getFullYear(),
          previousMonthEnd.getMonth(),
          1,
        ),
        end: previousMonthEnd,
      };
    }

    const currentDurationMs =
      currentRange.end.getTime() - currentRange.start.getTime();
    const previousEnd = new Date(currentRange.start.getTime() - 1);
    const previousStart = new Date(previousEnd.getTime() - currentDurationMs);

    return { start: previousStart, end: previousEnd };
  }

  private async getTotals(
    userId: number,
    goalId: number,
    range: DateRange,
  ): Promise<{
    incomeTotal: number;
    expenseTotal: number;
    netBalance: number;
    dailyAverage: number;
  }> {
    const [incomeTotal, expenseTotal] = await Promise.all([
      this.sumTransactions(userId, 'income', range),
      this.sumTransactions(userId, 'expense', range, goalId),
    ]);

    const days = this.countDays(range);

    return {
      incomeTotal,
      expenseTotal,
      netBalance: incomeTotal - expenseTotal,
      dailyAverage: days > 0 ? expenseTotal / days : 0,
    };
  }

  private async sumTransactions(
    userId: number,
    type: 'income' | 'expense',
    range: DateRange,
    goalId?: number,
  ): Promise<number> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .leftJoin('transaction.category', 'category')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type })
      .andWhere('transaction.transaction_date BETWEEN :start AND :end', {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });

    if (type === 'expense' && (goalId ?? 0) > 0) {
      query.leftJoin('category.savingGoal', 'savingGoal').andWhere('savingGoal.id = :goalId', {
        goalId,
      });
    }

    const raw = await query
      .select('COALESCE(SUM(transaction.amount), 0)', 'total')
      .getRawOne<{ total: string }>();

    return Number(raw?.total ?? 0);
  }

  private async getTopCategories(
    userId: number,
    goalId: number,
    currentRange: DateRange,
    previousRange: DateRange,
    currentExpenseTotal: number,
  ): Promise<InsightCategorySummary[]> {
    const [currentRows, previousRows] = await Promise.all([
      this.getCategorySpendRows(userId, goalId, currentRange),
      this.getCategorySpendRows(userId, goalId, previousRange),
    ]);

    const previousMap = new Map(
      previousRows.map((row) => [
        row.categoryName ?? 'Khac',
        Number(row.total) || 0,
      ]),
    );

    return currentRows.slice(0, 3).map((row) => {
      const amount = Number(row.total) || 0;
      const previousAmount = previousMap.get(row.categoryName ?? 'Khac') ?? 0;

      return {
        name: row.categoryName ?? 'Khac',
        amount,
        changePct: this.calculatePercentageChange(amount, previousAmount),
        percentageOfExpenses:
          currentExpenseTotal > 0
            ? Math.round((amount / currentExpenseTotal) * 100)
            : 0,
        icon: row.categoryIcon,
      };
    });
  }

  private async getCategorySpendRows(
    userId: number,
    goalId: number,
    range: DateRange,
  ): Promise<CategorySpendRow[]> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .leftJoin('transaction.category', 'category')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.transaction_date BETWEEN :start AND :end', {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
      });

    if (goalId > 0) {
      query.leftJoin('category.savingGoal', 'savingGoal').andWhere('savingGoal.id = :goalId', {
        goalId,
      });
    }

    return query
      .select('COALESCE(category.name, :fallbackName)', 'categoryName')
      .addSelect('MAX(category.icon)', 'categoryIcon')
      .addSelect('COALESCE(SUM(transaction.amount), 0)', 'total')
      .setParameter('fallbackName', 'Khac')
      .groupBy('category.name')
      .orderBy('SUM(transaction.amount)', 'DESC')
      .limit(5)
      .getRawMany<CategorySpendRow>();
  }

  private buildAlerts(
    totals: {
      incomeTotal: number;
      expenseTotal: number;
      netBalance: number;
      dailyAverage: number;
    },
    comparisonPrevMonth: FinancialInsightSnapshot['comparisonPrevMonth'],
    topCategories: InsightCategorySummary[],
  ): string[] {
    const alerts: string[] = [];

    if (totals.incomeTotal > 0 && totals.expenseTotal > totals.incomeTotal) {
      alerts.push('Tong chi hien tai dang vuot tong thu nhap trong ky nay.');
    }

    if (comparisonPrevMonth.expenseChangePct >= 20) {
      alerts.push(
        `Tong chi tieu tang ${comparisonPrevMonth.expenseChangePct.toFixed(1)}% so voi ky truoc.`,
      );
    }

    const highestCategory = topCategories[0];
    if (highestCategory && highestCategory.changePct >= 20) {
      alerts.push(
        `${highestCategory.name} dang tang ${highestCategory.changePct.toFixed(1)}% va chiem ${highestCategory.percentageOfExpenses}% tong chi.`,
      );
    }

    if (totals.netBalance < 0) {
      alerts.push(
        'Dong tien rong dang am. Nen uu tien giam cac khoan chi khong thiet yeu.',
      );
    }

    return alerts.slice(0, 3);
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }

    return ((current - previous) / Math.abs(previous)) * 100;
  }

  private countDays(range: DateRange): number {
    const start = new Date(range.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(range.end);
    end.setHours(0, 0, 0, 0);

    return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  }
}
