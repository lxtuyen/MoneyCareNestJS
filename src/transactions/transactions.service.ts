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
import { TotalByType } from 'src/common/interfaces/total-by-type.interface';
import { Notification } from 'src/notifications/entities/notification.entity';
import { CreateNotificationDto } from 'src/notifications/dto/create-notification.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { TotalByCategory } from 'src/common/interfaces/total-by-category.interface';
import { TotalByDate } from 'src/common/interfaces/total-by-date.interface';

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
    userId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<ApiResponse<TotalByCategory[]>> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.category', 'category')
      .leftJoin('transaction.user', 'user')
      .select('category.name', 'categoryName')
      .addSelect('category.percentage', 'percentage')
      .addSelect('category.icon', 'categoryIcon')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .groupBy('category.id')
      .addGroupBy('category.percentage');

    if (startDate)
      query.andWhere('transaction.transaction_date >= :start', {
        start: startDate,
      });

    if (endDate)
      query.andWhere('transaction.transaction_date <= :end', {
        end: endDate,
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

  async findById(id: number): Promise<ApiResponse<Transaction>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'user'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async getTotalsByType(
    userId: number,
    start_date?: string,
    end_date?: string,
  ): Promise<ApiResponse<{ income_total: number; expense_total: number }>> {
    const baseQuery = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .select('transaction.type', 'type')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('user.id = :userId', { userId })
      .groupBy('transaction.type');

    if (start_date && end_date) {
      baseQuery.andWhere(
        'transaction.transaction_date BETWEEN :start AND :end',
        {
          start: start_date,
          end: end_date,
        },
      );
    } else if (start_date) {
      baseQuery.andWhere('transaction.transaction_date >= :start', {
        start: start_date,
      });
    } else if (end_date) {
      baseQuery.andWhere('transaction.transaction_date <= :end', {
        end: end_date,
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

  async sumByDay(
    userId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<ApiResponse<TotalByDate[]>> {
    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .select('DATE(transaction.transaction_date)', 'date')
      .addSelect('SUM(transaction.amount)', 'total')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .groupBy('DATE(transaction.transaction_date)')
      .orderBy('DATE(transaction.transaction_date)', 'ASC');

    if (startDate) {
      query.andWhere('transaction.transaction_date >= :start', {
        start: startDate,
      });
    }

    if (endDate) {
      query.andWhere('transaction.transaction_date <= :end', {
        end: endDate,
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
