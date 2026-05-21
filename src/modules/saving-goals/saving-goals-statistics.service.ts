import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoalStatus } from './enums/saving-goal-status.enum';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { setStartOfDay, setEndOfDay } from 'src/common/utils/date.util';

export interface SavingGoalReport {
  milestones: SavingGoalMilestone[];
  projection: SavingGoalProjection;
}

export interface SavingGoalMilestone {
  label: string;
  start_date: Date;
  end_date: Date;
  target: number;
  actual: number;
  is_completed: boolean;
}

export interface SavingGoalProjection {
  monthlySavingCapacity: number;
  monthsRemaining: number | null;
  projectedDate: string | null;
  isOnTrack: boolean | null;
  monthsDiff: number | null;
  hasPlan: boolean;
}

@Injectable()
export class SavingGoalsStatisticsService {
  constructor(
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    private readonly spendingPlansService: SpendingPlansService,
  ) {}

  async getGoalReport(
    id: number,
    userId?: number,
  ): Promise<ApiResponse<SavingGoalReport>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['user', 'wallet'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    const categoryMap = new Map<string, number>();
    const { income, expense, transactions } =
      await this.calculateDetailedBalance(
        goal.user.id,
        goal.start_date || undefined,
        goal.end_date || undefined,
        goal.wallet?.id,
      );
    const current_automated_balance = goal.wallet?.balance || 0;

    transactions.forEach((t) => {
      if (t.type === 'expense') {
        const catName = t.category?.name || 'Khác';
        categoryMap.set(
          catName,
          (categoryMap.get(catName) || 0) + Number(t.amount),
        );
      }
    });

    const milestones = this.calculateMilestones(goal, transactions);

    const target = Number(goal.target ?? 0);
    const progress_percent =
      target > 0 ? Math.round((current_automated_balance / target) * 100) : 0;

    const balanceUsagePercentage =
      income > 0 ? Math.round((expense / income) * 100) : expense > 0 ? 100 : 0;
    const targetCompletionPercentage =
      target > 0 ? Math.round((current_automated_balance / target) * 100) : 0;

    const categoryBreakdown = Array.from(categoryMap.entries())
      .map(([name, total]) => ({
        category_name: name,
        total,
        percentage: expense > 0 ? Math.round((total / expense) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const now = new Date();
    const startDate = goal.start_date ? setStartOfDay(goal.start_date) : null;
    let daysDiff = 1;
    if (startDate) {
      const diffMs = now.getTime() - startDate.getTime();
      daysDiff = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const currentMilestoneIndex = milestones.findIndex(
      (m) => now >= m.start_date && now < m.end_date,
    );

    const isTargetAchieved = current_automated_balance >= target;
    const isPastEndDate = goal.end_date ? now >= goal.end_date : false;

    if (isTargetAchieved && !goal.is_completed && isPastEndDate) {
      goal.is_completed = true;
      goal.status = SavingGoalStatus.COMPLETED;

      if (goal.wallet) {
        await this.walletRepo.update(goal.wallet.id, { is_active: false });
      }

      await this.goalRepo.save(goal);
    }

    const capacity = await this.spendingPlansService.getMonthlySavingCapacity(
      goal.user.id,
    );
    let projection: SavingGoalProjection;
    if (capacity && capacity.monthlySavingCapacity > 0 && target > 0) {
      const remainingTarget = Math.max(0, target - current_automated_balance);
      const monthsRemaining = Math.ceil(
        remainingTarget / capacity.monthlySavingCapacity,
      );
      const projectedDate = new Date();
      projectedDate.setMonth(projectedDate.getMonth() + monthsRemaining);

      let isOnTrack = true;
      let monthsDiff = 0;
      if (goal.end_date) {
        const endDate = new Date(goal.end_date);
        const projectedMs = projectedDate.getTime() - endDate.getTime();
        monthsDiff = Math.round(projectedMs / (1000 * 60 * 60 * 24 * 30));
        isOnTrack = projectedDate <= endDate;
      }

      projection = {
        monthlySavingCapacity: capacity.monthlySavingCapacity,
        monthsRemaining,
        projectedDate: projectedDate.toISOString(),
        isOnTrack,
        monthsDiff: Math.abs(monthsDiff),
        hasPlan: true,
      };
    } else {
      projection = {
        monthlySavingCapacity: capacity?.monthlySavingCapacity ?? 0,
        monthsRemaining: null,
        projectedDate: null,
        isOnTrack: null,
        monthsDiff: null,
        hasPlan: !!capacity,
      };
    }

    const report = {
      id: goal.id,
      name: goal.name,
      target,
      start_date: goal.start_date,
      end_date: goal.end_date,
      current_balance: current_automated_balance,
      progress_percent: Math.max(0, progress_percent),
      is_completed: goal.is_completed,
      completion_notified: goal.completion_notified,
      current_milestone_index: currentMilestoneIndex,
      milestones,
      balanceUsagePercentage,
      totalSpent: expense,
      isOverBudget: expense > income && income > 0,
      targetCompletionPercentage: Math.max(0, targetCompletionPercentage),
      isTargetAchieved: current_automated_balance >= target,
      categoryBreakdown,
      totalTransactions: transactions.length,
      dailyAverageSpending: expense / daysDiff,
      remainingBudget: income - expense,
      wallet_name: goal.wallet?.name || null,
      wallet_balance: goal.wallet?.balance || 0,
      projection,
      transactions: transactions.map((t) => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        transaction_date: t.transaction_date,
        note: t.note,
        category: t.category
          ? {
              id: t.category.id,
              name: t.category.name,
              icon: t.category.icon,
              type: t.category.type,
            }
          : null,
        wallet: t.wallet ? { id: t.wallet.id, name: t.wallet.name } : null,
      })),
    };

    return ok(report);
  }

  private calculateMilestones(
    goal: SavingGoal,
    transactions: Transaction[],
  ): SavingGoalMilestone[] {
    if (!goal.start_date || !goal.end_date) return [];

    const start = setStartOfDay(goal.start_date);
    const end = setEndOfDay(goal.end_date);

    const totalDiffMs = end.getTime() - start.getTime();
    const totalDays = Math.max(
      1,
      Math.ceil(totalDiffMs / (1000 * 60 * 60 * 24)),
    );

    const milestoneDates: Date[] = [];
    const current = new Date(start);

    milestoneDates.push(new Date(start));

    let nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    while (nextMonth < end) {
      milestoneDates.push(new Date(nextMonth));
      nextMonth = new Date(
        nextMonth.getFullYear(),
        nextMonth.getMonth() + 1,
        1,
      );
    }

    milestoneDates.push(new Date(end));

    const totalTarget = Number(goal.target ?? 0);
    const results: SavingGoalMilestone[] = [];

    for (let i = 0; i < milestoneDates.length - 1; i++) {
      const mStart = milestoneDates[i];
      const mEnd = milestoneDates[i + 1];

      const segmentDiffMs = mEnd.getTime() - mStart.getTime();
      const segmentDays = Math.ceil(segmentDiffMs / (1000 * 60 * 60 * 24));

      const targetPerMilestone = (segmentDays / totalDays) * totalTarget;

      const mTransactions = transactions.filter(
        (t) => t.transaction_date >= mStart && t.transaction_date < mEnd,
      );

      const income = mTransactions
        .filter((t) => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount), 0);
      const expense = mTransactions
        .filter((t) => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount), 0);

      const saved = income - expense;

      results.push({
        label: `Tháng ${mStart.getMonth() + 1}/${mStart.getFullYear()}`,
        start_date: mStart,
        end_date: mEnd,
        target: Math.round(targetPerMilestone),
        actual: saved,
        is_completed: saved >= targetPerMilestone,
      });
    }

    return results;
  }

  private async calculateDetailedBalance(
    userId: number,
    startDate?: Date,
    endDate?: Date,
    walletId?: number,
  ) {
    const query = this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .leftJoinAndSelect('t.wallet', 'wallet')
      .where('t.userId = :userId', { userId });

    if (walletId) {
      query.andWhere('t.walletId = :walletId', { walletId });
    }

    if (startDate) {
      query.andWhere('t.transaction_date >= :startDate', {
        startDate: setStartOfDay(startDate),
      });
    }
    if (endDate) {
      query.andWhere('t.transaction_date <= :endDate', {
        endDate: setEndOfDay(endDate),
      });
    }

    const transactions = await query.getMany();
    let income = 0;
    let expense = 0;

    transactions.forEach((t) => {
      const amt = Number(t.amount);
      if (t.type === 'income') income += amt;
      else expense += amt;
    });

    return { income, expense, transactions };
  }
}
