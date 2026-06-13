import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { GetTransactionDto } from './dto/get-transaction.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import {
  TotalByDate,
  TotalsByDate,
} from 'src/common/interfaces/total-by-date.interface';
import { TotalByCategory } from 'src/common/interfaces/total-by-category.interface';
import { StatisticsSummaryResponseDto } from './dto/statistics-summary-response.dto';
import { CacheService } from 'src/common/cache/cache.service';
import { buildStatisticsSummaryCacheKey } from 'src/common/cache/financial-cache.util';
import {
  getVietnamNow,
  getVietnamMonthRange,
} from 'src/common/utils/date.util';
import { buildTransactionBaseQuery } from './transaction-query.util';

@Injectable()
export class TransactionStatisticsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private cacheService: CacheService,
  ) {}

  async sumByCategory(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<TotalByCategory[]>> {
    const categoryQuery = this.categoryRepo
      .createQueryBuilder('category')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('category.icon', 'categoryIcon');

    categoryQuery
      .leftJoin('category.user', 'user')
      .addSelect('NULL', 'target')
      .where('(user.id = :userId OR category.is_system = true)', {
        userId: dto.userId,
      });

    if (dto.type) {
      categoryQuery.andWhere('category.type = :type', {
        type: dto.type,
      });
    }

    const transactionQuery =
      dto.type === 'income'
        ? buildTransactionBaseQuery(
            this.transactionRepo,
            dto.userId,
            'income',
            {
              startDate: dto.startDate,
              endDate: dto.endDate,
            },
          )
        : buildTransactionBaseQuery(
            this.transactionRepo,
            dto.userId,
            'expense',
            {
              startDate: dto.startDate,
              endDate: dto.endDate,
            },
          );

    transactionQuery
      .select('category.id', 'categoryId')
      .addSelect(
        `SUM(
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
        )`,
        'total',
      )
      .groupBy('category.id');

    const [categories, totals] = await Promise.all([
      categoryQuery.getRawMany(),
      transactionQuery.getRawMany(),
    ]);

    const totalMap = new Map<number, number>(
      totals.map((t) => [
        t.categoryId ? Number(t.categoryId) : -1,
        Number(t.total) || 0,
      ]),
    );

    const grandTotal = Array.from(totalMap.values()).reduce(
      (sum: number, v: number) => sum + v,
      0,
    );

    const formatted: TotalByCategory[] = categories
      .map((cat) => {
        const spent = totalMap.get(Number(cat.categoryId)) ?? 0;
        return {
          category_id: Number(cat.categoryId),
          categoryName: cat.categoryName,
          categoryIcon: cat.categoryIcon,
          spendingPercentage:
            grandTotal > 0 ? Math.round((spent / grandTotal) * 100) : 0,
          total: spent,
        };
      })
      .filter((c) => c.total > 0);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: formatted,
    });
  }

  async getTotalsByType(dto: GetTransactionDto): Promise<
    ApiResponse<{
      income_total: number;
      expense_total: number;
      current_saving: number;
      target_saving: number;
    }>
  > {
    const incomeQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      dto.userId,
      'income',
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    );

    const expenseQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      dto.userId,
      'expense',
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
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

    const [incomeTotalRes, expenseTotalRes] = await Promise.all([
      incomeQuery.select(`SUM(${amountFormula})`, 'total').getRawOne(),
      expenseQuery.select(`SUM(${amountFormula})`, 'total').getRawOne(),
    ]);

    const incomeTotal = Number(incomeTotalRes?.total ?? 0);
    const expenseTotal = Number(expenseTotalRes?.total ?? 0);
    const currentSaving = incomeTotal - expenseTotal;
    const targetSaving = 0;

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        income_total: incomeTotal,
        expense_total: expenseTotal,
        current_saving: currentSaving,
        target_saving: targetSaving,
      },
    });
  }

  async getStatisticsSummary(
    userId: number,
  ): Promise<ApiResponse<StatisticsSummaryResponseDto>> {
    const cacheKey = buildStatisticsSummaryCacheKey(userId, 0);
    const cached =
      await this.cacheService.get<StatisticsSummaryResponseDto>(cacheKey);
    if (cached) {
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: cached,
      });
    }

    const now = new Date();
    const vietnamNow = getVietnamNow(now);

    const currentYear = vietnamNow.getFullYear();
    const currentMonth = vietnamNow.getMonth();

    const currentMonthRange = getVietnamMonthRange(
      currentMonth + 1,
      currentYear,
    );
    const currentMonthStart = currentMonthRange.start;
    const currentMonthEnd = now;

    const prevMonthDate = new Date(currentYear, currentMonth, 0);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const prevMonthLastDay = prevMonthDate.getDate();

    const prevMonthRange = getVietnamMonthRange(prevMonth + 1, prevYear);
    const prevMonthStart = prevMonthRange.start;
    const prevMonthEnd = prevMonthRange.end;

    const [currentMonthTotals, prevMonthTotals] = await Promise.all([
      this.getTotalsForRange(userId, currentMonthStart, currentMonthEnd),
      this.getTotalsForRange(userId, prevMonthStart, prevMonthEnd),
    ]);

    const daysPassedInCurrentMonth = vietnamNow.getDate();
    const daysInPrevMonth = prevMonthLastDay;

    const currentDailyAverage =
      currentMonthTotals.expense / daysPassedInCurrentMonth;
    const prevDailyAverage = prevMonthTotals.expense / daysInPrevMonth;

    const currentDailyIncomeAverage =
      currentMonthTotals.income / daysPassedInCurrentMonth;
    const prevDailyIncomeAverage = prevMonthTotals.income / daysInPrevMonth;

    const dailyAverageChange = this.calculatePercentageChange(
      currentDailyAverage,
      prevDailyAverage,
    );
    const dailyIncomeChange = this.calculatePercentageChange(
      currentDailyIncomeAverage,
      prevDailyIncomeAverage,
    );

    const summary: StatisticsSummaryResponseDto = {
      dailyAverage: currentDailyAverage,
      dailyAverageChange,
      dailyIncomeChange,
      monthlyBalance: currentMonthTotals.income - currentMonthTotals.expense,
    };

    await this.cacheService.set(cacheKey, summary, 300);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: summary,
    });
  }

  private async getTotalsForRange(userId: number, start: Date, end: Date) {
    const incomeQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      userId,
      'income',
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    );
    const expenseQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      userId,
      'expense',
      {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
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

    const [incomeRes, expenseRes] = await Promise.all([
      incomeQuery
        .select(`SUM(${amountFormula})`, 'total')
        .getRawOne<{ total: string }>(),
      expenseQuery
        .select(`SUM(${amountFormula})`, 'total')
        .getRawOne<{ total: string }>(),
    ]);

    return {
      income: Number(incomeRes?.total || 0),
      expense: Number(expenseRes?.total || 0),
    };
  }

  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  }

  async sumByDay(dto: GetTransactionDto): Promise<ApiResponse<TotalsByDate>> {
    const incomeQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      dto.userId,
      'income',
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    );

    const expenseQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      dto.userId,
      'expense',
      {
        startDate: dto.startDate,
        endDate: dto.endDate,
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

    const [incomeRes, expenseRes] = await Promise.all([
      incomeQuery
        .select(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
          'date',
        )
        .addSelect(`SUM(${amountFormula})`, 'total')
        .groupBy(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
        )
        .getRawMany<TotalByDate>(),
      expenseQuery
        .select(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
          'date',
        )
        .addSelect(`SUM(${amountFormula})`, 'total')
        .groupBy(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
        )
        .getRawMany<TotalByDate>(),
    ]);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        income: incomeRes.map((i) => ({
          date: i.date,
          total: Number(i.total) || 0,
        })),
        expense: expenseRes.map((e) => ({
          date: e.date,
          total: Number(e.total) || 0,
        })),
      },
    });
  }
}
