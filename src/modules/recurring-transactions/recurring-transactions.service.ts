import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull, Or } from 'typeorm';
import {
  RecurringTransaction,
  RecurringFrequency,
} from './entities/recurring-transaction.entity';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class RecurringTransactionsService {
  private readonly logger = new Logger(RecurringTransactionsService.name);

  constructor(
    @InjectRepository(RecurringTransaction)
    private readonly recurringRepo: Repository<RecurringTransaction>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async create(dto: CreateRecurringTransactionDto) {
    const { userId, categoryId, startDate, endDate, ...rest } = dto;
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Người dùng không tồn tại');
    }

    const category = categoryId
      ? await this.categoryRepo.findOne({ where: { id: categoryId } })
      : null;
    if (categoryId && !category) {
      throw new NotFoundException('Danh mục không tồn tại');
    }

    const recurring = this.recurringRepo.create({
      ...rest,
      user,
      category,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
    } as any);

    const savedRecurring = (await this.recurringRepo.save(
      recurring,
    )) as unknown as RecurringTransaction;
    return new ApiResponse<RecurringTransaction>({
      success: true,
      statusCode: 201,
      data: savedRecurring,
      message: 'Tạo giao dịch định kỳ thành công',
    });
  }

  async findAllByUser(userId: number) {
    const recurrences = await this.recurringRepo.find({
      where: { user: { id: userId } },
      relations: ['category'],
      order: { created_at: 'DESC' },
    });

    return new ApiResponse<RecurringTransaction[]>({
      success: true,
      statusCode: 200,
      data: recurrences,
    });
  }

  async remove(id: number) {
    await this.recurringRepo.delete(id);
    return new ApiResponse<boolean>({
      success: true,
      statusCode: 200,
      data: true,
      message: 'Xóa giao dịch định kỳ thành công',
    });
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleRecurringTransactions() {
    this.logger.log('Checking for due recurring transactions...');
    const now = new Date();

    // Find active recurring transactions that are due
    const recurringTransactions = await this.recurringRepo.find({
      where: {
        isActive: true,
        startDate: LessThanOrEqual(now),
      },
      relations: ['user', 'category'],
    });

    for (const rt of recurringTransactions) {
      if (rt.endDate && rt.endDate < now) {
        rt.isActive = false;
        await this.recurringRepo.save(rt);
        continue;
      }

      if (this.isDue(rt, now)) {
        await this.executeTransaction(rt, now);
      }
    }
  }

  private isDue(rt: RecurringTransaction, now: Date): boolean {
    const lastDate = rt.lastExecutedDate || rt.startDate;
    const diffTime = Math.abs(now.getTime() - lastDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    switch (rt.frequency) {
      case RecurringFrequency.DAILY:
        return diffDays >= 1;
      case RecurringFrequency.WEEKLY:
        return diffDays >= 7;
      case RecurringFrequency.MONTHLY:
        // Simple month check
        return (
          now.getMonth() !== lastDate.getMonth() ||
          now.getFullYear() !== lastDate.getFullYear()
        );
      case RecurringFrequency.YEARLY:
        return now.getFullYear() !== lastDate.getFullYear();
      default:
        return false;
    }
  }

  private async executeTransaction(rt: RecurringTransaction, now: Date) {
    this.logger.log(
      `Executing recurring transaction ${rt.id} for user ${rt.user.id}`,
    );

    const transaction = this.transactionRepo.create({
      amount: rt.amount,
      type: rt.type,
      note: `[Định kỳ] ${rt.note || ''}`,
      transaction_date: now,
      user: rt.user,
      category: rt.category,
    });

    await this.transactionRepo.save(transaction);

    rt.lastExecutedDate = now;
    await this.recurringRepo.save(rt);
  }
}
