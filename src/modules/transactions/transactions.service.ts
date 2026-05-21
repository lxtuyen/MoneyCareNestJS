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
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
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
    @InjectRepository(SubCategory)
    private subCategoryRepo: Repository<SubCategory>,
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

    const [user, requestedCategory, subCategory] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.userId } }),
      dto.categoryId
        ? this.categoryRepo.findOne({
            where: { id: dto.categoryId },
          })
        : Promise.resolve(null),
      dto.subCategoryId
        ? this.subCategoryRepo.findOne({
            where: { id: dto.subCategoryId },
            relations: ['category'],
          })
        : Promise.resolve(null),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (dto.categoryId && !requestedCategory) {
      throw new NotFoundException('Category not found');
    }
    if (dto.subCategoryId && !subCategory) {
      throw new NotFoundException('Sub category not found');
    }
    const category = requestedCategory ?? subCategory?.category ?? null;
    if (
      requestedCategory &&
      subCategory &&
      subCategory.category?.id !== requestedCategory.id
    ) {
      throw new BadRequestException('Sub category does not belong to category');
    }

    // Ensure we have a valid date
    let transactionDate: Date;
    if (dto.transactionDate) {
      transactionDate = new Date(dto.transactionDate);
      if (isNaN(transactionDate.getTime())) {
        console.warn(
          '>>> [BE] Invalid transactionDate received, falling back to current date',
        );
        transactionDate = new Date();
      }
    } else {
      transactionDate = new Date();
    }

    console.log(
      '>>> [BE] Parsed transaction_date:',
      transactionDate.toISOString(),
    );

    const transaction = this.transactionRepo.create({
      amount: dto.amount,
      type: dto.type,
      note: dto.note,
      transaction_date: transactionDate, // Match entity property name
      user,
      category,
      subCategory,
      wallet: dto.walletId ? ({ id: dto.walletId } as any) : null,
      pictureURL: dto.pictureURL,
    });

    if (dto.walletId) {
      const wallet = await this.walletRepo.findOne({
        where: { id: dto.walletId },
      });
      if (wallet) {
        const amt = Number(dto.amount);
        wallet.balance =
          dto.type === 'income'
            ? Number(wallet.balance) + amt
            : Number(wallet.balance) - amt;
        await this.walletRepo.save(wallet);
      }
    }

    // Budget alerts will be refactored to be wallet-based if needed

    await this.transactionRepo.save(transaction);

    // Invalidate cache for goals linked to this wallet
    let affectedGoalIds: number[] = [];
    if (dto.walletId) {
      const goals = await this.goalRepo.find({
        where: { wallet: { id: dto.walletId } },
      });
      affectedGoalIds = goals.map((g) => g.id);
    }
    await this.invalidateFinancialCache(user.id, affectedGoalIds);

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
      relations: ['category', 'subCategory', 'user', 'wallet'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    // Find goals linked to the old wallet
    let oldGoalIds: number[] = [];
    if (transaction.wallet) {
      const oldGoals = await this.goalRepo.find({
        where: { wallet: { id: transaction.wallet.id } },
      });
      oldGoalIds = oldGoals.map((g) => g.id);
    }

    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');
      transaction.category = category;
    } else if (dto.categoryId === null) {
      transaction.category = null;
    }
    if (dto.subCategoryId) {
      const subCategory = await this.subCategoryRepo.findOne({
        where: { id: dto.subCategoryId },
        relations: ['category'],
      });
      if (!subCategory) throw new NotFoundException('Sub category not found');
      const nextCategory = dto.categoryId
        ? transaction.category
        : subCategory.category;
      if (nextCategory && subCategory.category?.id !== nextCategory.id) {
        throw new BadRequestException(
          'Sub category does not belong to category',
        );
      }
      transaction.subCategory = subCategory;
      transaction.category = nextCategory;
    } else if (dto.subCategoryId === null) {
      transaction.subCategory = null;
    }
    transaction.amount = dto.amount ?? transaction.amount;
    transaction.type = dto.type ?? transaction.type;
    transaction.note = dto.note ?? transaction.note;
    transaction.pictureURL = dto.pictureURL ?? transaction.pictureURL;
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
          const wallet = await this.walletRepo.findOne({
            where: { id: oldWalletId },
          });
          if (wallet) {
            // Revert old
            wallet.balance =
              oldType === 'income'
                ? Number(wallet.balance) - oldAmount
                : Number(wallet.balance) + oldAmount;
            // Apply new
            wallet.balance =
              newType === 'income'
                ? Number(wallet.balance) + newAmount
                : Number(wallet.balance) - newAmount;
            await this.walletRepo.save(wallet);
          }
        }
      } else {
        // Different wallets
        if (oldWalletId) {
          const oldWallet = await this.walletRepo.findOne({
            where: { id: oldWalletId },
          });
          if (oldWallet) {
            oldWallet.balance =
              oldType === 'income'
                ? Number(oldWallet.balance) - oldAmount
                : Number(oldWallet.balance) + oldAmount;
            await this.walletRepo.save(oldWallet);
          }
        }
        if (newWalletId) {
          const newWallet = await this.walletRepo.findOne({
            where: { id: newWalletId },
          });
          if (newWallet) {
            newWallet.balance =
              newType === 'income'
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

    // Find goals linked to the new/current wallet
    let newGoalIds: number[] = [];
    if (transaction.wallet) {
      const newGoals = await this.goalRepo.find({
        where: { wallet: { id: transaction.wallet.id } },
      });
      newGoalIds = newGoals.map((g) => g.id);
    }

    await this.invalidateFinancialCache(transaction.user.id, [
      ...oldGoalIds,
      ...newGoalIds,
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
      .addSelect('category.icon', 'categoryIcon');

    categoryQuery
      .leftJoin('category.user', 'user')
      .addSelect('NULL', 'target')
      .where('(user.id = :userId OR category.is_system = true)', {
        userId: dto.userId,
      });

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
      categoryQuery.getRawMany(),
      transactionQuery.getRawMany(),
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

  async findAllByFilter(
    filter: TransactionFilterDto,
  ): Promise<ApiResponse<{ income: Transaction[]; expense: Transaction[] }>> {
    const {
      userId,
      categoryId,
      subCategoryId,
      walletId,
      startDate,
      endDate,
      categoryName,
      limit,
      includeTransfer,
    } = filter;

    const excludeTransfer = includeTransfer !== 'true';

    const incomeQuery = this.createBaseQuery(userId, 'income', {
      categoryId,
      subCategoryId,
      walletId,
      startDate,
      endDate,
      withRelations: true,
      categoryName,
      excludeTransfer,
    });

    const expenseQuery = this.createBaseQuery(userId, 'expense', {
      categoryId,
      subCategoryId,
      walletId,
      startDate,
      endDate,
      withRelations: true,
      categoryName,
      excludeTransfer,
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
      incomeQuery.select('SUM(transaction.amount)', 'total').getRawOne(),
      expenseQuery.select('SUM(transaction.amount)', 'total').getRawOne(),
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

    const currentMonthStart = getVietnamStartOfDay(
      currentYear,
      currentMonth,
      1,
    );
    const currentMonthEnd = now;

    const prevMonthDate = new Date(currentYear, currentMonth, 0);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const prevMonthLastDay = prevMonthDate.getDate();

    const prevMonthStart = getVietnamStartOfDay(prevYear, prevMonth, 1);
    const prevMonthEnd = getVietnamEndOfDay(
      prevYear,
      prevMonth,
      prevMonthLastDay,
    );

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
      relations: ['category', 'user', 'wallet'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (transaction.wallet) {
      const wallet = await this.walletRepo.findOne({
        where: { id: transaction.wallet.id },
      });
      if (wallet) {
        const amt = Number(transaction.amount);
        wallet.balance =
          transaction.type === 'income'
            ? Number(wallet.balance) - amt
            : Number(wallet.balance) + amt;
        await this.walletRepo.save(wallet);
      }
    }

    await this.transactionRepo.remove(transaction);
    // Invalidate cache for goals linked to this wallet
    let affectedGoalIds: number[] = [];
    if (transaction.wallet) {
      const goals = await this.goalRepo.find({
        where: { wallet: { id: transaction.wallet.id } },
      });
      affectedGoalIds = goals.map((g) => g.id);
    }
    await this.invalidateFinancialCache(transaction.user.id, affectedGoalIds);
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
        .select(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
          'date',
        )
        .addSelect('SUM(transaction.amount)', 'total')
        .groupBy(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
        )
        .getRawMany<TotalByDate>(),
      expenseQuery
        .select(
          "DATE(transaction.transaction_date AT TIME ZONE 'Asia/Ho_Chi_Minh')",
          'date',
        )
        .addSelect('SUM(transaction.amount)', 'total')
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

  private createBaseQuery(
    userId: number,
    type: 'income' | 'expense',
    {
      categoryId,
      subCategoryId,
      walletId,
      startDate,
      endDate,
      withRelations = false,
      categoryName,
      excludeTransfer = true,
    }: {
      categoryId?: number;
      subCategoryId?: number;
      walletId?: number;
      startDate?: string;
      endDate?: string;
      pictureURL?: string;
      withRelations?: boolean;
      categoryName?: string;
      excludeTransfer?: boolean;
    } = {},
  ) {
    const query = this.transactionRepo.createQueryBuilder('transaction');

    if (withRelations) {
      query.leftJoinAndSelect('transaction.category', 'category');
      query.leftJoinAndSelect('transaction.subCategory', 'subCategory');
      query.leftJoinAndSelect('transaction.user', 'user');
      query.leftJoinAndSelect('transaction.wallet', 'wallet');
    } else {
      query.leftJoin('transaction.category', 'category');
      query.leftJoin('transaction.subCategory', 'subCategory');
      query.leftJoin('transaction.user', 'user');
      query.leftJoin('transaction.wallet', 'wallet');
    }

    query
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type });

    if (excludeTransfer) {
      query.andWhere(
        "(category.name IS NULL OR category.name != 'Chuyển tiền')",
      );
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }
    if (subCategoryId) {
      query.andWhere('subCategory.id = :subCategoryId', { subCategoryId });
    }
    if (walletId) {
      query.andWhere('transaction.wallet = :walletId', { walletId });
    }

    const now = new Date();
    const offset = 7 * 60;
    const vnNow = new Date(
      now.getTime() + (offset + now.getTimezoneOffset()) * 60000,
    );
    const y = vnNow.getFullYear();
    const m = vnNow.getMonth();

    let start: Date;
    if (startDate && startDate !== 'null' && startDate !== 'undefined') {
      start = new Date(startDate);
    } else {
      start = new Date(Date.UTC(y, m, 1, -7, 0, 0));
    }

    let end: Date;
    if (endDate && endDate !== 'null' && endDate !== 'undefined') {
      end = new Date(endDate);
    } else {
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
