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
import {
  DateRange,
  getDateRange,
  getPreviousRange,
  getVietnamMonthRange,
} from 'src/common/utils/date.util';
import { buildTransactionBaseQuery } from 'src/modules/transactions/transaction-query.util';

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

    const currentRange = getDateRange(period);
    const previousRange = getPreviousRange(period, currentRange);

    const [currentTotals, previousTotals] = await Promise.all([
      this.getTotals(userId, currentRange),
      this.getTotals(userId, previousRange),
    ]);

    const topCategories = await this.getTopCategories(
      userId,
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

  async getMonthlyInsights(
    userId: number,
    goalId: number | undefined,
    month: number,
    year: number,
  ): Promise<FinancialInsightSnapshot> {
    const resolvedGoalId =
      goalId ?? (await this.getSelectedGoalId(userId)) ?? 0;
    const cacheKey = `v1:insights:user:${userId}:fund:${resolvedGoalId}:month:${year}-${month
      .toString()
      .padStart(2, '0')}`;
    const cached =
      await this.cacheService.get<FinancialInsightSnapshot>(cacheKey);
    if (cached) {
      return cached;
    }

    const currentRange = getVietnamMonthRange(month, year);
    const previousRange = getPreviousRange('this_month', currentRange);

    const [currentTotals, previousTotals] = await Promise.all([
      this.getTotals(userId, currentRange),
      this.getTotals(userId, previousRange),
    ]);

    const topCategories = await this.getTopCategories(
      userId,
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
      period: 'target_month',
      targetMonth: month,
      targetYear: year,
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
      where: { user: { id: userId }, is_selected: true, is_completed: false },
      order: { updated_at: 'DESC' },
    });
    if (selected) return selected.id;

    const fallback = await this.goalRepo.findOne({
      where: { user: { id: userId }, is_completed: false },
      order: { updated_at: 'DESC' },
    });

    return fallback?.id ?? null;
  }

  private async getTotals(
    userId: number,
    range: DateRange,
  ): Promise<{
    incomeTotal: number;
    expenseTotal: number;
    netBalance: number;
    dailyAverage: number;
  }> {
    const [incomeTotal, expenseTotal] = await Promise.all([
      this.sumTransactions(userId, 'income', range),
      this.sumTransactions(userId, 'expense', range),
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
  ): Promise<number> {
    const query = buildTransactionBaseQuery(
      this.transactionRepo,
      userId,
      type,
      {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        excludeTransfer: true,
      },
    );

    const amountFormula = `
      CASE
        WHEN transaction.coupleId IS NOT NULL THEN
          CASE
            WHEN transaction.splitMethod != 'none' THEN
              COALESCE(splits.amount, 0)
            ELSE
              CASE WHEN transaction.payerId = :userId THEN transaction.amount ELSE 0 END
          END
        ELSE
          transaction.amount
      END
    `;

    const raw = await query
      .select(`COALESCE(SUM(${amountFormula}), 0)`, 'total')
      .getRawOne<{ total: string }>();

    return Number(raw?.total ?? 0);
  }

  private async getTopCategories(
    userId: number,
    currentRange: DateRange,
    previousRange: DateRange,
    currentExpenseTotal: number,
  ): Promise<InsightCategorySummary[]> {
    const [currentRows, previousRows] = await Promise.all([
      this.getCategorySpendRows(userId, currentRange),
      this.getCategorySpendRows(userId, previousRange),
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
    range: DateRange,
  ): Promise<CategorySpendRow[]> {
    const query = buildTransactionBaseQuery(
      this.transactionRepo,
      userId,
      'expense',
      {
        startDate: range.start.toISOString(),
        endDate: range.end.toISOString(),
        excludeTransfer: true,
      },
    );

    const amountFormula = `
      CASE
        WHEN transaction.coupleId IS NOT NULL THEN
          CASE
            WHEN transaction.splitMethod != 'none' THEN
              COALESCE(splits.amount, 0)
            ELSE
              CASE WHEN transaction.payerId = :userId THEN transaction.amount ELSE 0 END
          END
        ELSE
          transaction.amount
      END
    `;

    return query
      .select('COALESCE(category.name, :fallbackName)', 'categoryName')
      .addSelect('MAX(category.icon)', 'categoryIcon')
      .addSelect(`COALESCE(SUM(${amountFormula}), 0)`, 'total')
      .setParameter('fallbackName', 'Khac')
      .groupBy('category.name')
      .addGroupBy('category.id')
      .orderBy(`SUM(${amountFormula})`, 'DESC')
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
