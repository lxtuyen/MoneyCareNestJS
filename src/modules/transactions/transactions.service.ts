import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import {
  TotalByDate,
  TotalsByDate,
} from 'src/common/interfaces/total-by-date.interface';
import { TotalByCategory } from 'src/common/interfaces/total-by-category.interface';
import { GetTransactionDto } from './dto/get-transaction.dto';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { NotificationType } from 'src/modules/notifications/entities/notification.entity';
import { StatisticsSummaryResponseDto } from './dto/statistics-summary-response.dto';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildStatisticsSummaryCacheKey,
  getFinancialCacheKeys,
  getAiAnalysisRegistryKeys,
} from 'src/common/cache/financial-cache.util';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(SavingGoal)
    private goalRepo: Repository<SavingGoal>,
    private notificationsService: NotificationsService,
    private cacheService: CacheService,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    const [user, category] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.userId } }),
      dto.categoryId
        ? this.categoryRepo.findOne({
            where: { id: dto.categoryId },
            relations: ['savingGoal'],
          })
        : Promise.resolve(null),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (dto.categoryId && !category) {
      throw new NotFoundException('Category not found');
    }

    const transaction = this.transactionRepo.create({
      amount: dto.amount,
      type: dto.type,
      note: dto.note,
      transaction_date: dto.transactionDate
        ? new Date(dto.transactionDate)
        : new Date(),
      user,
      category,
    });

    let currentExpenseTotal = 0;
    if (dto.type === 'expense' && category?.savingGoal) {
      const currentExpenseRes = await this.transactionRepo
        .createQueryBuilder('t')
        .where('t.category.id = :categoryId', { categoryId: category.id })
        .andWhere('t.type = :type', { type: 'expense' })
        .select('SUM(t.amount)', 'total')
        .getRawOne<{ total: string }>();

      currentExpenseTotal = Number(currentExpenseRes?.total || 0);
    }

    await this.transactionRepo.save(transaction);
    await this.invalidateFinancialCache(user.id, [category?.savingGoal?.id ?? 0]);

    if (dto.type === 'expense' && category?.savingGoal) {
      const limitBase = Number(category.savingGoal.target || 0);
      const budgetLimit = (limitBase * Number(category.percentage)) / 100;
      const sumExpensesAfter = currentExpenseTotal + Number(dto.amount);

      if (budgetLimit > 0 && currentExpenseTotal <= budgetLimit && sumExpensesAfter > budgetLimit) {
        await this.notificationsService.sendPushNotification(
          user,
          'Cảnh báo ngân sách',
          `Khoản chi vừa rồi đã khiến mục "${category.name}" vượt quá ngân sách dự kiến (${budgetLimit.toLocaleString('vi-VN')} đ)!`,
          undefined,
          NotificationType.ALERT,
        );
      }
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async update(
    id: number,
    dto: UpdateTransactionDto,
  ): Promise<ApiResponse<Transaction>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'category.savingGoal', 'user'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    const previousGoalId = transaction.category?.savingGoal?.id ?? 0;

    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
        relations: ['savingGoal'],
      });
      if (!category) throw new NotFoundException('Category not found');
      transaction.category = category;
    } else if (dto.categoryId === null) {
      transaction.category = null;
    }
    transaction.amount = dto.amount ?? transaction.amount;
    transaction.type = dto.type ?? transaction.type;
    transaction.note = dto.note ?? transaction.note;
    transaction.pictuteURL = dto.pictuteURL ?? transaction.pictuteURL;
    if (dto.transactionDate) {
      transaction.transaction_date = new Date(dto.transactionDate);
    }

    await this.transactionRepo.save(transaction);
    await this.invalidateFinancialCache(transaction.user.id, [
      previousGoalId,
      transaction.category?.savingGoal?.id ?? 0,
    ]);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async sumByCategory(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<TotalByCategory[]>> {
    const categoryQuery = this.categoryRepo
      .createQueryBuilder('category')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('category.percentage', 'percentage')
      .addSelect('category.icon', 'categoryIcon');

    if (dto.savingGoalId) {
      categoryQuery
        .leftJoin('category.savingGoal', 'savingGoal')
        .leftJoin('category.user', 'user')
        .addSelect('savingGoal.target', 'target')
        .where('user.id = :userId', { userId: dto.userId })
        .andWhere('(savingGoal.id = :goalId OR savingGoal.id IS NULL)', {
          goalId: dto.savingGoalId,
        });
    } else {
      categoryQuery
        .leftJoin('category.user', 'user')
        .addSelect('NULL', 'target')
        .where('user.id = :userId', { userId: dto.userId });
    }

    if (dto.type) {
      categoryQuery.andWhere(
        '(category.type = :type OR category.type = :others)',
        {
          type: dto.type,
          others: 'others',
        },
      );
    }

    const transactionQuery =
      dto.type === 'income'
        ? this.createBaseQuery(dto.userId, 'income', {
            savingGoalId: dto.savingGoalId,
            startDate: dto.startDate,
            endDate: dto.endDate,
          })
        : this.createBaseQuery(dto.userId, 'expense', {
            savingGoalId: dto.savingGoalId,
            startDate: dto.startDate,
            endDate: dto.endDate,
          });

    transactionQuery
      .select('category.id', 'categoryId')
      .addSelect('SUM(transaction.amount)', 'total')
      .groupBy('category.id');

    const [categories, totals] = await Promise.all([
      categoryQuery.getRawMany<{
        categoryId: number;
        categoryName: string;
        percentage: number;
        categoryIcon: string;
        target: string | null;
      }>(),
      transactionQuery.getRawMany<{
        categoryId: number | null;
        total: string;
      }>(),
    ]);

    const totalMap = new Map(
      totals.map((t) => [
        t.categoryId ? Number(t.categoryId) : -1,
        Number(t.total) || 0,
      ]),
    );

    const grandTotal = Array.from(totalMap.values()).reduce(
      (sum, v) => sum + v,
      0,
    );

    const formatted: TotalByCategory[] = categories.map((cat) => {
      const spent = totalMap.get(Number(cat.categoryId)) ?? 0;
      return {
        category_id: Number(cat.categoryId),
        categoryName: cat.categoryName,
        categoryIcon: cat.categoryIcon,
        percentage: Number(cat.percentage),
        spendingPercentage:
          grandTotal > 0 ? Math.round((spent / grandTotal) * 100) : 0,
        limit: (Number(cat.percentage) * Number(cat.target || 0)) / 100,
        total: spent,
      };
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: formatted,
    });
  }

  async findAllByFilter(
    filter: TransactionFilterDto,
  ): Promise<ApiResponse<{ income: Transaction[]; expense: Transaction[] }>> {
    const { userId, categoryId, startDate, endDate, savingGoalId, categoryName, limit } = filter;

    const incomeQuery = this.createBaseQuery(userId, 'income', {
      categoryId,
      savingGoalId,
      startDate,
      endDate,
      withRelations: true,
      categoryName,
    });

    const expenseQuery = this.createBaseQuery(userId, 'expense', {
      categoryId,
      savingGoalId,
      startDate,
      endDate,
      withRelations: true,
      categoryName,
    });

    incomeQuery.orderBy('transaction.transaction_date', 'DESC');
    expenseQuery.orderBy('transaction.transaction_date', 'DESC');

    if (limit) {
      incomeQuery.take(limit);
      expenseQuery.take(limit);
    }

    const [income, expense] = await Promise.all([
      incomeQuery.getMany(),
      expenseQuery.getMany(),
    ]);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: { income, expense },
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
    const incomeQuery = this.createBaseQuery(dto.userId, 'income', {
      savingGoalId: dto.savingGoalId,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const expenseQuery = this.createBaseQuery(dto.userId, 'expense', {
      savingGoalId: dto.savingGoalId,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const [incomeTotalRes, expenseTotalRes, goal] = await Promise.all([
      incomeQuery
        .select('SUM(transaction.amount)', 'total')
        .getRawOne<{ total: string }>(),
      expenseQuery
        .select('SUM(transaction.amount)', 'total')
        .getRawOne<{ total: string }>(),
      dto.savingGoalId
        ? this.goalRepo.findOne({ where: { id: dto.savingGoalId } })
        : Promise.resolve(null),
    ]);

    const incomeTotal = Number(incomeTotalRes?.total ?? 0);
    const expenseTotal = Number(expenseTotalRes?.total ?? 0);
    const currentSaving = incomeTotal - expenseTotal;
    const targetSaving = Number(goal?.target ?? 0);

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
    savingGoalId?: number,
  ): Promise<ApiResponse<StatisticsSummaryResponseDto>> {
    const resolvedGoalId = Number(savingGoalId) || 0;
    const cacheKey = buildStatisticsSummaryCacheKey(userId, resolvedGoalId);
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
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = now;

    const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const prevMonthEnd = new Date(currentYear, currentMonth, 0);

    const [currentMonthTotals, prevMonthTotals] = await Promise.all([
      this.getTotalsForRange(
        userId,
        currentMonthStart,
        currentMonthEnd,
        resolvedGoalId,
      ),
      this.getTotalsForRange(userId, prevMonthStart, prevMonthEnd, resolvedGoalId),
    ]);

    const daysPassedInCurrentMonth = now.getDate();
    const daysInPrevMonth = prevMonthEnd.getDate();

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

  private async getTotalsForRange(
    userId: number,
    start: Date,
    end: Date,
    savingGoalId?: number,
  ) {
    const incomeQuery = this.createBaseQuery(userId, 'income', {
      savingGoalId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    const expenseQuery = this.createBaseQuery(userId, 'expense', {
      savingGoalId,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });

    const [incomeRes, expenseRes] = await Promise.all([
      incomeQuery
        .select('SUM(transaction.amount)', 'total')
        .getRawOne<{ total: string }>(),
      expenseQuery
        .select('SUM(transaction.amount)', 'total')
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

  private async invalidateFinancialCache(
    userId: number,
    goalIds: number[],
  ): Promise<void> {
    const keys = getFinancialCacheKeys(userId, [0, ...goalIds]);
    await this.cacheService.delMany(keys);

    const registryKeys = getAiAnalysisRegistryKeys(userId, [0, ...goalIds]);
    const registryEntries = await Promise.all(
      registryKeys.map((registryKey) =>
        this.cacheService.get<string[]>(registryKey),
      ),
    );

    const analysisKeys = Array.from(
      new Set(registryEntries.flatMap((entry) => entry ?? [])),
    );

    await this.cacheService.delMany([...analysisKeys, ...registryKeys]);
  }

  async remove(id: number): Promise<ApiResponse<string>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'category.savingGoal', 'user'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    await this.transactionRepo.remove(transaction);
    await this.invalidateFinancialCache(transaction.user.id, [
      transaction.category?.savingGoal?.id ?? 0,
    ]);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

  async sumByDay(dto: GetTransactionDto): Promise<ApiResponse<TotalsByDate>> {
    const incomeQuery = this.createBaseQuery(dto.userId, 'income', {
      savingGoalId: dto.savingGoalId,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const expenseQuery = this.createBaseQuery(dto.userId, 'expense', {
      savingGoalId: dto.savingGoalId,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const [incomeRes, expenseRes] = await Promise.all([
      incomeQuery
        .select('DATE(transaction.transaction_date)', 'date')
        .addSelect('SUM(transaction.amount)', 'total')
        .groupBy('DATE(transaction.transaction_date)')
        .getRawMany<TotalByDate>(),
      expenseQuery
        .select('DATE(transaction.transaction_date)', 'date')
        .addSelect('SUM(transaction.amount)', 'total')
        .groupBy('DATE(transaction.transaction_date)')
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

  private createBaseQuery(
    userId: number,
    type: 'income' | 'expense',
    {
      categoryId,
      savingGoalId,
      startDate,
      endDate,
      withRelations = false,
      categoryName,
    }: {
      categoryId?: number;
      savingGoalId?: number;
      startDate?: string;
      endDate?: string;
      withRelations?: boolean;
      categoryName?: string;
    } = {},
  ) {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type });

    if (withRelations) {
      query.leftJoinAndSelect('transaction.category', 'category');
      query.leftJoinAndSelect('transaction.user', 'user');
    } else {
      query.leftJoin('transaction.category', 'category');
      query.leftJoin('transaction.user', 'user');
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }
    if (savingGoalId) {
      query.leftJoin('category.savingGoal', 'savingGoal');
      query.andWhere('(savingGoal.id = :goalId OR savingGoal.id IS NULL)', {
        goalId: savingGoalId,
      });
    }
    if (startDate && startDate !== 'null') {
      query.andWhere('transaction.transaction_date >= :start', {
        start: startDate,
      });
    }
    if (endDate && endDate !== 'null') {
      query.andWhere('transaction.transaction_date <= :end', { end: endDate });
    }
    if (categoryName) {
      query.andWhere('category.name LIKE :catName', {
        catName: `%${categoryName}%`,
      });
    }
    return query;
  }
}
