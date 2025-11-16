import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { User } from 'src/user/entities/user.entity';
import { Category } from 'src/categories/entities/category.entity';
import { plainToInstance } from 'class-transformer';
import { TransactionResponseDto } from './dto/transaction-response.dto';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { TotalByType } from 'src/common/interfaces/total-by-type.interface';
import { Notification } from 'src/notifications/entities/notification.entity';

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

  async create(dto: CreateTransactionDto) {
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

    await this.createNotification(
      user.id,
      dto.type === 'income' ? 'Thu nhập mới' : 'Chi tiêu mới',
      dto.type === 'income'
        ? `Bạn vừa nhận ${dto.amount} VND`
        : `Bạn vừa chi ${dto.amount} VND cho ${category?.name || 'giao dịch'}`,
      dto.type,
      transaction,
    );

    return plainToInstance(TransactionResponseDto, transaction, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: number, dto: UpdateTransactionDto) {
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
    if (dto.transactionDate) {
      transaction.transaction_date = new Date(dto.transactionDate);
    }

    await this.transactionRepo.save(transaction);

    await this.createNotification(
      transaction.user.id,
      'Cập nhật giao dịch',
      transaction.type === 'income'
        ? `Bạn vừa cập nhật giao dịch thu: ${transaction.amount} VND`
        : `Bạn vừa cập nhật giao dịch chi: ${transaction.amount} VND cho ${transaction.category?.name || 'giao dịch'}`,
      transaction.type,
      transaction,
    );

    return plainToInstance(TransactionResponseDto, transaction, {
      excludeExtraneousValues: true,
    });
  }

  async findAllByUser(userId: number) {
    return this.transactionRepo.find({
      where: { user: { id: userId } },
      relations: ['category', 'user'],
      order: { created_at: 'DESC' },
    });
  }

  async findAllByFilter(filter: TransactionFilterDto) {
    const { userId, type, categoryId, start_date, end_date } = filter;

    const query = this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.user', 'user')
      .where('user.id = :userId', { userId });

    if (type) {
      query.andWhere('transaction.type = :type', { type });
    }

    if (categoryId) {
      query.andWhere('category.id = :categoryId', { categoryId });
    }

    if (start_date)
      query.andWhere('transaction.transaction_date >= :start', {
        start: start_date,
      });
    if (end_date)
      query.andWhere('transaction.transaction_date <= :end', { end: end_date });

    query.orderBy('transaction.transaction_date', 'DESC');

    const results = await query.getMany();

    return results.map((t) =>
      plainToInstance(TransactionResponseDto, t, {
        excludeExtraneousValues: true,
      }),
    );
  }

  async findById(id: number) {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'user'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    return plainToInstance(TransactionResponseDto, transaction, {
      excludeExtraneousValues: true,
    });
  }

  async getTotals(
    userId: number,
    start_date?: string,
    end_date?: string,
  ): Promise<{ income_total: number; expense_total: number }> {
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

    return {
      income_total: incomeTotal,
      expense_total: expenseTotal,
    };
  }

  async remove(id: number) {
    const transaction = await this.transactionRepo.findOne({ where: { id } });
    if (!transaction) throw new NotFoundException('Transaction not found');
    await this.transactionRepo.remove(transaction);
    return { message: 'Transaction deleted successfully' };
  }

  private async createNotification(
    userId: number,
    title: string,
    message: string,
    type?: string,
    transaction?: Transaction,
  ) {
    const notification = this.notificationRepo.create({
      user_id: userId,
      title,
      message,
      type: type ?? transaction?.type ?? '',
      transaction,
    });
    await this.notificationRepo.save(notification);
  }
}
