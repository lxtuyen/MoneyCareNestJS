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
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import {
  TotalByDate,
  TotalsByDate,
} from 'src/common/interfaces/total-by-date.interface';
import { TotalByCategory } from 'src/common/interfaces/total-by-category.interface';
import { GetTransactionDto } from './dto/get-transaction.dto';
import { NotificationsService } from 'src/modules/notifications/notifications.service';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    private notificationsService: NotificationsService,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    const [user, category] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.userId } }),
      dto.type === 'expense' && dto.categoryId
        ? this.categoryRepo.findOne({ where: { id: dto.categoryId }, relations: ['savingFund'] })
        : Promise.resolve(null),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (dto.type === 'expense') {
      if (!dto.categoryId)
        throw new BadRequestException('Category is required for expense');
      if (!category) throw new NotFoundException('Category not found');
    }

    const transaction = this.transactionRepo.create({
      amount: dto.amount,
      type: dto.type,
      note: dto.note,
      transaction_date: dto.transactionDate,
      user,
      category,
    });

    let currentExpenseTotal = 0;
    if (dto.type === 'expense' && category?.savingFund) {
      const currentExpenseRes = await this.transactionRepo
        .createQueryBuilder('t')
        .where('t.category.id = :categoryId', { categoryId: category.id })
        .andWhere('t.type = :type', { type: 'expense' })
        .select('SUM(t.amount)', 'total')
        .getRawOne<{ total: string }>();
        
      currentExpenseTotal = Number(currentExpenseRes?.total || 0);
    }

    await this.transactionRepo.save(transaction);

    if (dto.type === 'expense' && category?.savingFund) {
      const budget = (Number(category.savingFund.amount) * Number(category.percentage)) / 100;
      const sumExpensesAfter = currentExpenseTotal + Number(dto.amount);
      
      if (currentExpenseTotal <= budget && sumExpensesAfter > budget) {
        await this.notificationsService.sendPushNotification(
          user,
          'Cảnh báo ngân sách',
          `Khoản chi vừa rồi đã khiến mục "${category.name}" vượt quá ngân sách dự kiến (${budget.toLocaleString('vi-VN')} đ)!`,
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

    if (dto.type === 'income') {
      transaction.category = null;
    } else if (dto.type === 'expense' && dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');
      transaction.category = category;
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
    const categoryQuery = this.categoryRepo
      .createQueryBuilder('category')
      .leftJoin('category.savingFund', 'savingFund')
      .leftJoin('savingFund.user', 'user')
      .select('category.id', 'categoryId')
      .addSelect('category.name', 'categoryName')
      .addSelect('category.percentage', 'percentage')
      .addSelect('category.icon', 'categoryIcon')
      .where('user.id = :userId', { userId: dto.userId });

    if (dto.fundId)
      categoryQuery.andWhere('savingFund.id = :fundId', {
        fundId: dto.fundId,
      });

    const transactionQuery = this.getBaseExpenseQuery(
      dto.userId,
      undefined,
      dto.fundId,
      dto.startDate,
      dto.endDate,
    )
      .select('category.id', 'categoryId')
      .addSelect('SUM(transaction.amount)', 'total')
      .groupBy('category.id');

    const [categories, totals] = await Promise.all([
      categoryQuery.getRawMany<{
        categoryId: number;
        categoryName: string;
        percentage: number;
        categoryIcon: string;
      }>(),
      transactionQuery.getRawMany<{
        categoryId: number;
        total: string;
      }>(),
    ]);

    const totalMap = new Map(
      totals.map((t) => [Number(t.categoryId), Number(t.total) || 0]),
    );

    const formatted: TotalByCategory[] = categories.map((cat) => ({
      categoryName: cat.categoryName,
      categoryIcon: cat.categoryIcon,
      percentage: cat.percentage,
      total: totalMap.get(Number(cat.categoryId)) ?? 0,
    }));

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
  ): Promise<ApiResponse<{ income_total: number; expense_total: number }>> {
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

    const [incomeTotalRes, expenseTotalRes] = await Promise.all([
      incomeQuery.select('SUM(transaction.amount)', 'total').getRawOne<{ total: string }>(),
      expenseQuery.select('SUM(transaction.amount)', 'total').getRawOne<{ total: string }>(),
    ]);

    const incomeTotal = Number(incomeTotalRes?.total ?? 0);
    const expenseTotal = Number(expenseTotalRes?.total ?? 0);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: { income_total: incomeTotal, expense_total: expenseTotal },
    });
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
      query.leftJoinAndSelect('transaction.user', 'user');
    } else {
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
      query.leftJoin('category.savingFund', 'savingFund');
      query.andWhere('savingFund.id = :fundId', { fundId });
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
