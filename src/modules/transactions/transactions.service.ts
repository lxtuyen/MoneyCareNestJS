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
import { Fund } from 'src/modules/saving-funds/entities/fund.entity';
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

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(Fund)
    private fundRepo: Repository<Fund>,
    private notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    const [user, category] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.userId } }),
      dto.categoryId
        ? this.categoryRepo.findOne({
            where: { id: dto.categoryId },
            relations: ['fund'],
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
      transaction_date: dto.transactionDate ? new Date(dto.transactionDate) : new Date(),
      user,
      category,
    });

    let currentExpenseTotal = 0;
    if (dto.type === 'expense' && category?.fund) {
      const currentExpenseRes = await this.transactionRepo
        .createQueryBuilder('t')
        .where('t.category.id = :categoryId', { categoryId: category.id })
        .andWhere('t.type = :type', { type: 'expense' })
        .select('SUM(t.amount)', 'total')
        .getRawOne<{ total: string }>();
        
      currentExpenseTotal = Number(currentExpenseRes?.total || 0);
    }

    await this.transactionRepo.save(transaction);

    if (dto.type === 'expense' && category?.fund) {
      const balance = (Number(category.fund.balance) * Number(category.percentage)) / 100;
      const sumExpensesAfter = currentExpenseTotal + Number(dto.amount);
      
      if (currentExpenseTotal <= balance && sumExpensesAfter > balance) {
        await this.notificationsService.sendPushNotification(
          user,
          'Cảnh báo ngân sách',
          `Khoản chi vừa rồi đã khiến mục "${category.name}" vượt quá ngân sách dự kiến (${balance.toLocaleString('vi-VN')} đ)!`,
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
      relations: ['category'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
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

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async sumByCategory(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<TotalByCategory[]>> {
    // Khi có fundId: lấy categories từ quỹ (có balance để tính limit)
    // Khi không có fundId: lấy categories thuộc user trực tiếp (user categories)
    const categoryQuery = this.categoryRepo
      .createQueryBuilder('category')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('category.percentage', 'percentage')
      .addSelect('category.icon', 'categoryIcon');

    if (dto.fundId) {
      categoryQuery
        .leftJoin('category.fund', 'fund')
        .leftJoin('fund.user', 'user')
        .addSelect('fund.balance', 'balance')
        .where('user.id = :userId', { userId: dto.userId })
        .andWhere('fund.id = :fundId', { fundId: dto.fundId });
    } else {
      categoryQuery
        .leftJoin('category.user', 'user')
        .addSelect('NULL', 'balance')
        .where('user.id = :userId', { userId: dto.userId });
    }

    if (dto.type) {
      categoryQuery.andWhere('(category.type = :type OR category.type = :others)', { 
        type: dto.type, 
        others: 'others' 
      });
    }

    const transactionQuery =
      dto.type === 'income'
        ? this.getBaseIncomeQuery(dto.userId, dto.startDate, dto.endDate, false)
        : this.getBaseExpenseQuery(
            dto.userId,
            undefined,
            dto.fundId,
            dto.startDate,
            dto.endDate,
          );

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
        balance: string | null;
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

    let categorizedTotal = 0;
    const formatted: TotalByCategory[] = categories.map((cat) => {
      const spent = totalMap.get(Number(cat.categoryId)) ?? 0;
      categorizedTotal += spent;
      return {
        categoryId: Number(cat.categoryId),
        categoryName: cat.categoryName,
        categoryIcon: cat.categoryIcon,
        percentage: Number(cat.percentage),
        spendingPercentage:
          grandTotal > 0 ? Math.round((spent / grandTotal) * 100) : 0,
        limit: (Number(cat.percentage) * Number(cat.balance || 0)) / 100,
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
    const { userId, categoryId, startDate, endDate, fundId } = filter;

    const incomeQuery = this.getBaseIncomeQuery(
      userId,
      startDate,
      endDate,
      true,
    );

    const expenseQuery = this.getBaseExpenseQuery(
      userId,
      categoryId,
      fundId,
      startDate,
      endDate,
      true,
    );

    incomeQuery.orderBy('transaction.transaction_date', 'DESC');
    expenseQuery.orderBy('transaction.transaction_date', 'DESC');

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

  async getTotalsByType(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<{ 
    income_total: number; 
    expense_total: number; 
    current_saving: number;
    target_saving: number;
  }>> {
    const incomeQuery = this.getBaseIncomeQuery(
      dto.userId,
      dto.startDate,
      dto.endDate,
    );

    const expenseQuery = this.getBaseExpenseQuery(
      dto.userId,
      undefined,
      dto.fundId,
      dto.startDate,
      dto.endDate,
    );

    const [incomeTotalRes, expenseTotalRes, fund] = await Promise.all([
      incomeQuery.select('SUM(transaction.amount)', 'total').getRawOne<{ total: string }>(),
      expenseQuery.select('SUM(transaction.amount)', 'total').getRawOne<{ total: string }>(),
      dto.fundId ? this.fundRepo.findOne({ where: { id: dto.fundId } }) : Promise.resolve(null),
    ]);

    const incomeTotal = Number(incomeTotalRes?.total ?? 0);
    const expenseTotal = Number(expenseTotalRes?.total ?? 0);
    const currentSaving = incomeTotal - expenseTotal;
    const targetSaving = Number(fund?.target ?? 0);

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
    fundId?: number,
  ): Promise<ApiResponse<StatisticsSummaryResponseDto>> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const currentMonthStart = new Date(currentYear, currentMonth, 1);
    const currentMonthEnd = now;

    const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
    const prevMonthEnd = new Date(currentYear, currentMonth, 0);

    const [currentMonthTotals, prevMonthTotals] = await Promise.all([
      this.getTotalsForRange(userId, currentMonthStart, currentMonthEnd, fundId),
      this.getTotalsForRange(userId, prevMonthStart, prevMonthEnd, fundId),
    ]);

    const daysPassedInCurrentMonth = now.getDate();
    const daysInPrevMonth = prevMonthEnd.getDate();

    const currentDailyAverage = currentMonthTotals.expense / daysPassedInCurrentMonth;
    const prevDailyAverage = prevMonthTotals.expense / daysInPrevMonth;

    const currentDailyIncomeAverage = currentMonthTotals.income / daysPassedInCurrentMonth;
    const prevDailyIncomeAverage = prevMonthTotals.income / daysInPrevMonth;

    const dailyAverageChange = this.calculatePercentageChange(
      currentDailyAverage,
      prevDailyAverage,
    );
    const dailyIncomeChange = this.calculatePercentageChange(
      currentDailyIncomeAverage,
      prevDailyIncomeAverage,
    );

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        dailyAverage: currentDailyAverage,
        dailyAverageChange,
        dailyIncomeChange,
        monthlyBalance: currentMonthTotals.income - currentMonthTotals.expense,
      },
    });
  }

  private async getTotalsForRange(
    userId: number,
    start: Date,
    end: Date,
    fundId?: number,
  ) {
    const incomeQuery = this.getBaseIncomeQuery(
      userId,
      start.toISOString(),
      end.toISOString(),
    );
    const expenseQuery = this.getBaseExpenseQuery(
      userId,
      undefined,
      fundId,
      start.toISOString(),
      end.toISOString(),
    );

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

  async remove(id: number): Promise<ApiResponse<string>> {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    await this.transactionRepo.remove(transaction);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

  async sumByDay(dto: GetTransactionDto): Promise<ApiResponse<TotalsByDate>> {
    const incomeQuery = this.getBaseIncomeQuery(
      dto.userId,
      dto.startDate,
      dto.endDate,
    );

    const expenseQuery = this.getBaseExpenseQuery(
      dto.userId,
      undefined,
      dto.fundId,
      dto.startDate,
      dto.endDate,
    );

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

  private getBaseIncomeQuery(
    userId: number,
    startDate?: string,
    endDate?: string,
    withRelations = false,
  ) {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'income' });

    if (withRelations) {
      query.leftJoinAndSelect('transaction.category', 'category');
      query.leftJoinAndSelect('transaction.user', 'user');
    } else {
      query.leftJoin('transaction.category', 'category');
      query.leftJoin('transaction.user', 'user');
    }

    if (startDate) {
      query.andWhere('transaction.transaction_date >= :start', { start: startDate });
    }
    if (endDate) {
      query.andWhere('transaction.transaction_date <= :end', { end: endDate });
    }
    return query;
  }

  private getBaseExpenseQuery(
    userId: number,
    categoryId?: number,
    fundId?: number,
    startDate?: string,
    endDate?: string,
    withRelations = false,
  ) {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' });

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
    if (fundId) {
      query.leftJoin('category.fund', 'fund');
      query.andWhere('fund.id = :fundId', { fundId });
    }
    if (startDate) {
      query.andWhere('transaction.transaction_date >= :start', { start: startDate });
    }
    if (endDate) {
      query.andWhere('transaction.transaction_date <= :end', { end: endDate });
    }
    return query;
  }
}
