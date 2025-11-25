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
import { TotalByType } from 'src/common/interfaces/total-by-type.interface';
import { Notification } from 'src/notifications/entities/notification.entity';
import { CreateNotificationDto } from 'src/notifications/dto/create-notification.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { TotalByDate } from 'src/common/interfaces/total-by-date.interface';
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
    await this.transactionRepo.save(transaction);

    await this.createNotification({
      userId: user.id,
      title: dto.type === 'income' ? 'Thu nhập mới' : 'Chi tiêu mới',
      message:
        dto.type === 'income'
          ? `Bạn vừa nhận ${dto.amount} VND`
          : `Bạn vừa chi ${dto.amount} VND cho ${category?.name || 'giao dịch'}`,
      type: dto.type,
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

    await this.createNotification({
      userId: transaction.user.id,
      title: 'Cập nhật giao dịch',
      message:
        transaction.type === 'income'
          ? `Bạn vừa cập nhật giao dịch thu: ${transaction.amount} VND`
          : `Bạn vừa cập nhật giao dịch chi: ${transaction.amount} VND cho ${transaction.category?.name || 'giao dịch'}`,
      type: transaction.type,
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
      .leftJoin('transaction.user', 'user')
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
    const { userId, categoryName, start_date, end_date } = filter;

    const incomeQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'income' });

    const expenseQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('transaction.userId = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' });

    if (categoryName) {
      incomeQuery.andWhere('category.name = :categoryName', { categoryName });
      expenseQuery.andWhere('category.name = :categoryName', { categoryName });
    }

    if (start_date) {
      incomeQuery.andWhere('transaction.transaction_date >= :start', {
        start: start_date,
      });
      expenseQuery.andWhere('transaction.transaction_date >= :start', {
        start: start_date,
      });
    }

    if (end_date) {
      incomeQuery.andWhere('transaction.transaction_date <= :end', {
        end: end_date,
      });
      expenseQuery.andWhere('transaction.transaction_date <= :end', {
        end: end_date,
      });
    }

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

  async findById(id: number): Promise<ApiResponse<Transaction>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async getTotalsByType(
    dto: GetTransactionDto,
  ): Promise<ApiResponse<{ income_total: number; expense_total: number }>> {
    const baseQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .select('transaction.type', 'type')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('user.id = :userId', { userId: dto.userId })
      .groupBy('transaction.type');

    if (dto.startDate && dto.endDate) {
      baseQuery.andWhere(
        'transaction.transaction_date BETWEEN :start AND :end',
        {
          start: dto.startDate,
          end: dto.endDate,
        },
      );
    } else if (dto.startDate) {
      baseQuery.andWhere('transaction.transaction_date >= :start', {
        start: dto.startDate,
      });
    } else if (dto.endDate) {
      baseQuery.andWhere('transaction.transaction_date <= :end', {
        end: dto.endDate,
      });
    }

    const results = await baseQuery.getRawMany<TotalByType>();

    const incomeTotal = Number(
      results.find((r) => r.type === 'income')?.total ?? 0,
    );
    const expenseTotal = Number(
      results.find((r) => r.type === 'expense')?.total ?? 0,
    );

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        income_total: incomeTotal,
        expense_total: expenseTotal,
      },
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
    const notification = this.notificationRepo.create({
      user_id: dto.userId,
      title: dto.title,
      message: dto.message,
      type: dto.type,
    });
    await this.notificationRepo.save(notification);
  }

  async sumByDay(dto: GetTransactionDto): Promise<ApiResponse<TotalByDate[]>> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .select('DATE(transaction.transaction_date)', 'date')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('user.id = :userId', { userId: dto.userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .groupBy('DATE(transaction.transaction_date)')
      .orderBy('DATE(transaction.transaction_date)', 'ASC');

    if (dto.startDate) {
      query.andWhere('transaction.transaction_date >= :start', {
        start: dto.startDate,
      });
    }

    if (dto.endDate) {
      query.andWhere('transaction.transaction_date <= :end', {
        end: dto.endDate,
      });
    }

    const raw = await query.getRawMany<TotalByDate>();

    const formatted = raw.map((item) => ({
      date: item.date,
      total: Number(item.total),
    }));

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: formatted,
    });
  }

  async findLatest4ByTypePerUser(
    userId: number,
  ): Promise<ApiResponse<{ income: Transaction[]; expense: Transaction[] }>> {
    const incomeTransactions = await this.transactionRepo.find({
      where: { user: { id: userId }, type: 'income' },
      relations: ['category'],
      order: { created_at: 'DESC' },
      take: 4,
    });

    const expenseTransactions = await this.transactionRepo.find({
      where: { user: { id: userId }, type: 'expense' },
      relations: ['category'],
      order: { created_at: 'DESC' },
      take: 4,
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        income: incomeTransactions,
        expense: expenseTransactions,
      },
    });
  }

  async findByNotePerUser(userId: number): Promise<ApiResponse<Transaction[]>> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .where('transaction.userId = :userId', { userId });

    const transactions = await query
      .orderBy('transaction.created_at', 'DESC')
      .getMany();

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transactions,
    });
  }
}
