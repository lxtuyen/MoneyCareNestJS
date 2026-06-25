import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HabitCommitment } from './entities/habit-commitment.entity';
import { CreateHabitCommitmentDto } from './dto/create-habit-commitment.dto';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';

@Injectable()
export class HabitCommitmentsService {
  constructor(
    @InjectRepository(HabitCommitment)
    private readonly commitmentRepo: Repository<HabitCommitment>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  /**
   * Tạo cam kết giảm thói quen.
   * Unique per (user, habitName, month, year).
   */
  async create(
    userId: number,
    dto: CreateHabitCommitmentDto,
  ): Promise<HabitCommitment> {
    // Check trùng
    const existing = await this.commitmentRepo.findOne({
      where: {
        userId,
        habitName: dto.habitName,
        month: dto.month,
        year: dto.year,
      },
    });

    if (existing) {
      // Update nếu đã tồn tại
      existing.committedCount = dto.committedCount;
      existing.subcategoryName = dto.subcategoryName;
      existing.goalId = dto.goalId ?? existing.goalId;
      if (dto.potentialSavings !== undefined) {
        existing.potentialSavings = dto.potentialSavings;
      }
      if (dto.avgPerTransaction !== undefined) {
        existing.avgPerTransaction = dto.avgPerTransaction;
      }
      if (dto.projectedCount !== undefined) {
        existing.projectedCount = dto.projectedCount;
      }
      return this.commitmentRepo.save(existing);
    }

    const commitment = this.commitmentRepo.create({
      userId,
      goalId: dto.goalId ?? null,
      habitName: dto.habitName,
      subcategoryName: dto.subcategoryName,
      committedCount: dto.committedCount,
      potentialSavings: dto.potentialSavings ?? 0,
      avgPerTransaction: dto.avgPerTransaction ?? 0,
      projectedCount: dto.projectedCount ?? 0,
      month: dto.month,
      year: dto.year,
    });

    return this.commitmentRepo.save(commitment);
  }

  /**
   * Lấy danh sách cam kết theo tháng.
   */
  async findByMonth(
    userId: number,
    month: number,
    year: number,
  ): Promise<HabitCommitment[]> {
    return this.commitmentRepo.find({
      where: { userId, month, year },
      relations: ['goal'],
      order: { created_at: 'ASC' },
    });
  }

  /**
   * Lấy tiến độ của 1 cam kết: đếm giao dịch match sub_category.
   */
  async getProgress(
    userId: number,
    commitmentId: number,
  ): Promise<{
    commitment: HabitCommitment;
    currentCount: number;
    remaining: number;
    isExceeded: boolean;
  }> {
    const commitment = await this.commitmentRepo.findOne({
      where: { id: commitmentId, userId },
      relations: ['goal'],
    });
    if (!commitment) throw new NotFoundException('Commitment not found');

    const currentCount = await this.countTransactionsForCommitment(
      userId,
      commitment,
    );

    const remaining = Math.max(0, commitment.committedCount - currentCount);
    const isExceeded = currentCount > commitment.committedCount;

    return { commitment, currentCount, remaining, isExceeded };
  }

  /**
   * Lấy tiến độ cho tất cả cam kết theo tháng (bulk).
   */
  async getProgressByMonth(
    userId: number,
    month: number,
    year: number,
  ): Promise<
    Array<{
      commitment: HabitCommitment;
      currentCount: number;
      remaining: number;
      isExceeded: boolean;
    }>
  > {
    const commitments = await this.findByMonth(userId, month, year);
    const results = await Promise.all(
      commitments.map(async (c) => {
        const currentCount = await this.countTransactionsForCommitment(
          userId,
          c,
        );
        return {
          commitment: c,
          currentCount,
          remaining: Math.max(0, c.committedCount - currentCount),
          isExceeded: currentCount > c.committedCount,
        };
      }),
    );
    return results;
  }

  /**
   * Cập nhật số lần cam kết.
   */
  async update(
    userId: number,
    commitmentId: number,
    committedCount: number,
  ): Promise<HabitCommitment> {
    const commitment = await this.commitmentRepo.findOne({
      where: { id: commitmentId, userId },
      relations: ['goal'],
    });
    if (!commitment) throw new NotFoundException('Commitment not found');

    commitment.committedCount = committedCount;
    // Recalculate potentialSavings based on new count
    const avgPerTx = Number(commitment.avgPerTransaction) || 0;
    const projectedCount = commitment.projectedCount || 0;
    const reducedCount = Math.max(0, projectedCount - committedCount);
    commitment.potentialSavings = reducedCount * avgPerTx;

    return this.commitmentRepo.save(commitment);
  }

  /**
   * Xóa cam kết.
   */
  async remove(userId: number, commitmentId: number): Promise<void> {
    const commitment = await this.commitmentRepo.findOne({
      where: { id: commitmentId, userId },
    });
    if (!commitment) throw new NotFoundException('Commitment not found');
    await this.commitmentRepo.remove(commitment);
  }

  /**
   * Xóa tất cả cam kết thuộc 1 goal.
   */
  async removeByGoal(userId: number, goalId: number): Promise<number> {
    const result = await this.commitmentRepo.delete({ userId, goalId });
    return result.affected ?? 0;
  }

  /**
   * Đếm số giao dịch match sub_category name trong tháng.
   */
  private async countTransactionsForCommitment(
    userId: number,
    commitment: HabitCommitment,
  ): Promise<number> {
    const startDate = new Date(commitment.year, commitment.month - 1, 1);
    const endDate = new Date(commitment.year, commitment.month, 0, 23, 59, 59);

    const count = await this.transactionRepo
      .createQueryBuilder('tx')
      .innerJoin('tx.subCategory', 'sc')
      .innerJoin('tx.user', 'u')
      .where('u.id = :userId', { userId })
      .andWhere('tx.type = :type', { type: 'expense' })
      .andWhere('tx.transaction_date >= :startDate', { startDate })
      .andWhere('tx.transaction_date <= :endDate', { endDate })
      .andWhere('LOWER(sc.name) = LOWER(:subcategoryName)', {
        subcategoryName: commitment.subcategoryName,
      })
      .getCount();

    return count;
  }
}
