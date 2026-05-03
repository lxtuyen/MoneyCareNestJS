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
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
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
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    private notificationsService: NotificationsService,
    private cacheService: CacheService,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    console.log('>>> [BE] CreateTransactionDto received:', {
      ...dto,
      transactionDate: dto.transactionDate,
    });

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

    // Ensure we have a valid date
    let transactionDate: Date;
    if (dto.transactionDate) {
      transactionDate = new Date(dto.transactionDate);
      if (isNaN(transactionDate.getTime())) {
        console.warn('>>> [BE] Invalid transactionDate received, falling back to current date');
        transactionDate = new Date();
      }
    } else {
      transactionDate = new Date();
    }
    
    console.log('>>> [BE] Parsed transaction_date:', transactionDate.toISOString());

    const transaction = this.transactionRepo.create({
      amount: dto.amount,
      type: dto.type,
      note: dto.note,
      transaction_date: transactionDate, // Match entity property name
      user,
      category,
      wallet: dto.walletId ? ({ id: dto.walletId } as any) : null,
      pictuteURL: dto.pictuteURL,
    });

    if (dto.walletId) {
      const wallet = await this.walletRepo.findOne({ where: { id: dto.walletId } });
      if (wallet) {
        const amt = Number(dto.amount);
        wallet.balance = dto.type === 'income' 
          ? Number(wallet.balance) + amt 
          : Number(wallet.balance) - amt;
        await this.walletRepo.save(wallet);
      }
    }

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
      relations: ['category', 'category.savingGoal', 'user', 'wallet'],
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
      const parsedDate = new Date(dto.transactionDate);
      if (!isNaN(parsedDate.getTime())) {
        transaction.transaction_date = parsedDate;
      } else {
        console.warn('>>> [BE] Invalid transactionDate received during update');
      }
    }

    const oldAmount = Number(transaction.amount);
    const newAmount = dto.amount !== undefined ? Number(dto.amount) : oldAmount;
    const oldType = transaction.type;
    const newType = dto.type ?? oldType;
    const oldWalletId = transaction.wallet?.id;
    const newWalletId = dto.walletId !== undefined ? dto.walletId : oldWalletId;

    if (oldWalletId || newWalletId) {
      if (oldWalletId === newWalletId) {
        // Same wallet, update diff
        if (oldWalletId) {
          const wallet = await this.walletRepo.findOne({ where: { id: oldWalletId } });
          if (wallet) {
            // Revert old
            wallet.balance = oldType === 'income' 
              ? Number(wallet.balance) - oldAmount 
              : Number(wallet.balance) + oldAmount;
            // Apply new
            wallet.balance = newType === 'income' 
              ? Number(wallet.balance) + newAmount 
              : Number(wallet.balance) - newAmount;
            await this.walletRepo.save(wallet);
          }
        }
      } else {
        // Different wallets
        if (oldWalletId) {
          const oldWallet = await this.walletRepo.findOne({ where: { id: oldWalletId } });
          if (oldWallet) {
            oldWallet.balance = oldType === 'income' 
              ? Number(oldWallet.balance) - oldAmount 
              : Number(oldWallet.balance) + oldAmount;
            await this.walletRepo.save(oldWallet);
          }
        }
        if (newWalletId) {
          const newWallet = await this.walletRepo.findOne({ where: { id: newWalletId } });
          if (newWallet) {
            newWallet.balance = newType === 'income' 
              ? Number(newWallet.balance) + newAmount 
              : Number(newWallet.balance) - newAmount;
            await this.walletRepo.save(newWallet);
          }
        }
      }
    }

    if (dto.walletId !== undefined) {
      transaction.wallet = dto.walletId ? ({ id: dto.walletId } as any) : null;
    }
    transaction.amount = newAmount;
    transaction.type = newType;

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

    categoryQuery
      .leftJoin('category.user', 'user')
      .addSelect('NULL', 'target')
      .where('user.id = :userId', { userId: dto.userId });

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
            startDate: dto.startDate,
            endDate: dto.endDate,
          })
        : this.createBaseQuery(dto.userId, 'expense', {
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
    const { userId, categoryId, walletId, startDate, endDate, categoryName, limit } = filter;

    const incomeQuery = this.createBaseQuery(userId, 'income', {
      categoryId,
      walletId,
      startDate,
      endDate,
      withRelations: true,
      categoryName,
    });

    const expenseQuery = this.createBaseQuery(userId, 'expense', {
      categoryId,
      walletId,
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
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const expenseQuery = this.createBaseQuery(dto.userId, 'expense', {
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const [incomeTotalRes, expenseTotalRes] = await Promise.all([
      incomeQuery
        .select('SUM(transaction.amount)', 'total')
        .getRawOne<{ total: string }>(),
      expenseQuery
        .select('SUM(transaction.amount)', 'total')
        .getRawOne<{ total: string }>(),
    ]);

    const goal = null;

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
    const vietnamNowStr = now.toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const vietnamNow = new Date(vietnamNowStr);

    const currentYear = vietnamNow.getFullYear();
    const currentMonth = vietnamNow.getMonth();

    // Function to create a Date object representing 00:00:00 in Vietnam timezone
    const getVietnamStartOfDay = (y: number, m: number, d: number) => {
      return new Date(
        `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+07:00`,
      );
    };

    // Function to create a Date object representing 23:59:59 in Vietnam timezone
    const getVietnamEndOfDay = (y: number, m: number, d: number) => {
      return new Date(
        `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T23:59:59+07:00`,
      );
    };

    const currentMonthStart = getVietnamStartOfDay(currentYear, currentMonth, 1);
    const currentMonthEnd = now;

    const prevMonthDate = new Date(currentYear, currentMonth, 0);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const prevMonthLastDay = prevMonthDate.getDate();

    const prevMonthStart = getVietnamStartOfDay(prevYear, prevMonth, 1);
    const prevMonthEnd = getVietnamEndOfDay(prevYear, prevMonth, prevMonthLastDay);

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

  private async getTotalsForRange(
    userId: number,
    start: Date,
    end: Date,
  ) {
    const incomeQuery = this.createBaseQuery(userId, 'income', {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    const expenseQuery = this.createBaseQuery(userId, 'expense', {
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
      relations: ['category', 'category.savingGoal', 'user', 'wallet'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');
    
    if (transaction.wallet) {
      const wallet = await this.walletRepo.findOne({ where: { id: transaction.wallet.id } });
      if (wallet) {
        const amt = Number(transaction.amount);
        wallet.balance = transaction.type === 'income' 
          ? Number(wallet.balance) - amt 
          : Number(wallet.balance) + amt;
        await this.walletRepo.save(wallet);
      }
    }

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
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const expenseQuery = this.createBaseQuery(dto.userId, 'expense', {
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    const [incomeRes, expenseRes] = await Promise.all([
      incomeQuery
        .select("DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')", 'date')
        .addSelect('SUM(transaction.amount)', 'total')
        .groupBy("DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')")
        .getRawMany<TotalByDate>(),
      expenseQuery
        .select("DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')", 'date')
        .addSelect('SUM(transaction.amount)', 'total')
        .groupBy("DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')")
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
      walletId,
      startDate,
      endDate,
      withRelations = false,
      categoryName,
    }: {
      categoryId?: number;
      walletId?: number;
      startDate?: string;
      endDate?: string;
      withRelations?: boolean;
      categoryName?: string;
    } = {},
  ) {


    const query = this.transactionRepo.createQueryBuilder('transaction');

    if (withRelations) {
      query.leftJoinAndSelect('transaction.category', 'category');
      query.leftJoinAndSelect('transaction.user', 'user');
      query.leftJoinAndSelect('transaction.wallet', 'wallet');
    } else {
      query.leftJoin('transaction.category', 'category');
      query.leftJoin('transaction.user', 'user');
      query.leftJoin('transaction.wallet', 'wallet');
    }

    query
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type });

    if (categoryId) {
      query.andWhere('transaction.category = :categoryId', { categoryId });
    }
    if (walletId) {
      query.andWhere('transaction.wallet = :walletId', { walletId });
    }
    
    const now = new Date();
    const offset = 7 * 60; // Vietnam is UTC+7
    const vnNow = new Date(now.getTime() + (offset + now.getTimezoneOffset()) * 60000);
    const y = vnNow.getFullYear();
    const m = vnNow.getMonth();

    let start: Date;
    if (startDate && startDate !== 'null' && startDate !== 'undefined') {
      start = new Date(startDate);
    } else {
      // Start of current month in VN
      start = new Date(Date.UTC(y, m, 1, -7, 0, 0)); 
    }

    let end: Date;
    if (endDate && endDate !== 'null' && endDate !== 'undefined') {
      end = new Date(endDate);
    } else {
      // End of current month in VN
      const lastDay = new Date(y, m + 1, 0).getDate();
      end = new Date(Date.UTC(y, m, lastDay, 16, 59, 59, 999));
    }

    if (!isNaN(start.getTime())) {
      query.andWhere('transaction.transaction_date >= :start', { start });
    }
    if (!isNaN(end.getTime())) {
      query.andWhere('transaction.transaction_date <= :end', { end });
    }
    if (categoryName) {
      query.andWhere('category.name LIKE :catName', {
        catName: `%${categoryName}%`,
      });
    }
    return query;
  }
}
