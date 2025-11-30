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
import { User } from 'src/user/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { Notification } from 'src/notifications/entities/notification.entity';
import { CreateNotificationDto } from 'src/notifications/dto/create-notification.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import {
  TotalByDate,
  TotalsByDate,
} from 'src/common/interfaces/total-by-date.interface';
import { TotalByCategory } from 'src/common/interfaces/total-by-category.interface';
import { GetTransactionDto } from './dto/get-transaction.dto';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');

    let category: Category | null = null;
    if (dto.type === 'expense') {
      if (!dto.categoryId)
        throw new BadRequestException('Category is required for expense');
      category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
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
    const data = await this.transactionRepo.save(transaction);

    await this.createNotification({
      userId: user.id,
      title: dto.type === 'income' ? 'Thu nhập mới' : 'Chi tiêu mới',
      message:
        dto.type === 'income'
          ? `Bạn vừa nhận ${dto.amount} VND`
          : `Bạn vừa chi ${dto.amount} VND cho ${category?.name || 'giao dịch'}`,
      type: dto.type,
      transaction: data,
    });

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
      relations: ['category', 'user'],
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

    await this.createNotification({
      userId: transaction.user.id,
      title: 'Cập nhật giao dịch',
      message:
        transaction.type === 'income'
          ? `Bạn vừa cập nhật giao dịch thu: ${transaction.amount} VND`
          : `Bạn vừa cập nhật giao dịch chi: ${transaction.amount} VND cho ${transaction.category?.name || 'giao dịch'}`,
      type: transaction.type,
      transaction: transaction,
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async sumByCategory(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<TotalByCategory[]>> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .leftJoin('category.savingFund', 'savingFund')
      .leftJoin('savingFund.user', 'user')
      .select('category.name', 'categoryName')
      .addSelect('category.percentage', 'percentage')
      .addSelect('category.icon', 'categoryIcon')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('user.id = :userId', { userId: dto.userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .groupBy('category.id')
      .addGroupBy('category.percentage');

    if (dto.startDate)
      query.andWhere('transaction.transaction_date >= :start', {
        start: dto.startDate,
      });

    if (dto.endDate)
      query.andWhere('transaction.transaction_date <= :end', {
        end: dto.endDate,
      });

    if (dto.fundId)
      query.andWhere('savingFund.id = :fundId', {
        fundId: dto.fundId,
      });

    const raw = await query.getRawMany<TotalByCategory>();

    const formatted = raw.map((item) => ({
      categoryName: item.categoryName,
      categoryIcon: item.categoryIcon,
      percentage: item.percentage,
      total: Number(item.total),
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

    const incomeQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'income' });

    if (startDate)
      incomeQuery.andWhere('transaction.transaction_date >= :start', {
        start: startDate,
      });
    if (endDate)
      incomeQuery.andWhere('transaction.transaction_date <= :end', {
        end: endDate,
      });

    const expenseQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoin('category.savingFund', 'savingFund')
      .leftJoin('savingFund.user', 'user')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' });
    if (categoryId)
      expenseQuery.andWhere('category.id = :categoryId', { categoryId });
    if (fundId) expenseQuery.andWhere('savingFund.id = :fundId', { fundId });
    if (startDate)
      expenseQuery.andWhere('transaction.transaction_date >= :start', {
        start: startDate,
      });
    if (endDate)
      expenseQuery.andWhere('transaction.transaction_date <= :end', {
        end: endDate,
      });

    incomeQuery.orderBy('transaction.transaction_date', 'DESC');
    expenseQuery.orderBy('transaction.transaction_date', 'DESC');

    const income = await incomeQuery.getMany();
    const expense = await expenseQuery.getMany();

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: { income, expense },
    });
  }

  async getTotalsByType(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<{ income_total: number; expense_total: number }>> {
    const incomeTotalRes = await this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .where('user.id = :userId', { userId: dto.userId })
      .andWhere('transaction.type = :type', { type: 'income' })
      .select('SUM(transaction.amount)', 'total')
      .getRawOne<{ total: string }>();

    const incomeTotal = Number(incomeTotalRes?.total ?? 0);

    const expenseQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .leftJoin('category.savingFund', 'savingFund')
      .leftJoin('savingFund.user', 'user')
      .where('user.id = :userId', { userId: dto.userId })
      .andWhere('transaction.type = :type', { type: 'expense' });

    if (dto.fundId)
      expenseQuery.andWhere('savingFund.id = :fundId', { fundId: dto.fundId });
    if (dto.startDate)
      expenseQuery.andWhere('transaction.transaction_date >= :start', {
        start: dto.startDate,
      });
    if (dto.endDate)
      expenseQuery.andWhere('transaction.transaction_date <= :end', {
        end: dto.endDate,
      });

    const expenseTotalRes = await expenseQuery
      .select('SUM(transaction.amount)', 'total')
      .getRawOne<{ total: string }>();
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

  private async createNotification(dto: CreateNotificationDto) {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('User not found');
    const notification = this.notificationRepo.create({
      title: dto.title,
      message: dto.message,
      type: dto.type,
      user,
      transaction: dto.transaction,
    });
    await this.notificationRepo.save(notification);
  }

  async sumByDay(dto: GetTransactionDto): Promise<ApiResponse<TotalsByDate>> {
    const incomeRes = await this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .where('user.id = :userId', { userId: dto.userId })
      .andWhere('transaction.type = :type', { type: 'income' })
      .andWhere(
        dto.startDate ? 'transaction.transaction_date >= :start' : '1=1',
        { start: dto.startDate },
      )
      .andWhere(dto.endDate ? 'transaction.transaction_date <= :end' : '1=1', {
        end: dto.endDate,
      })
      .select('DATE(transaction.transaction_date)', 'date')
      .addSelect('SUM(transaction.amount)', 'total')
      .groupBy('DATE(transaction.transaction_date)')
      .getRawMany<TotalByDate>();

    const expenseQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .leftJoin('category.savingFund', 'savingFund')
      .leftJoin('savingFund.user', 'user')
      .where('user.id = :userId', { userId: dto.userId })
      .andWhere('transaction.type = :type', { type: 'expense' });

    if (dto.fundId)
      expenseQuery.andWhere('savingFund.id = :fundId', { fundId: dto.fundId });
    if (dto.startDate)
      expenseQuery.andWhere('transaction.transaction_date >= :start', {
        start: dto.startDate,
      });
    if (dto.endDate)
      expenseQuery.andWhere('transaction.transaction_date <= :end', {
        end: dto.endDate,
      });

    const expenseRes = await expenseQuery
      .select('DATE(transaction.transaction_date)', 'date')
      .addSelect('SUM(transaction.amount)', 'total')
      .groupBy('DATE(transaction.transaction_date)')
      .getRawMany<TotalByDate>();

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
