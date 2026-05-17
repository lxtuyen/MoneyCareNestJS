import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, Between, MoreThanOrEqual } from 'typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { UpdateSavingGoalDto } from './dto/update-goal.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateSavingGoalDto } from './dto/create-goal.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingGoalResponseDto } from './dto/goal-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { SavingGoalStatus } from './enums/saving-goal-status.enum';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';

@Injectable()
export class SavingGoalsService {
  constructor(
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,

    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,

    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,

    private readonly spendingPlansService: SpendingPlansService,
  ) {}

  async create(
    dto: CreateSavingGoalDto,
    userId?: number,
  ): Promise<ApiResponse<SavingGoalResponseDto>> {
    const ownerId = userId ?? dto.userId;
    const user = await this.userRepo.findOne({ where: { id: ownerId } });
    if (!user) throw new NotFoundException('User not found');

    if (!dto.walletId && !dto.create_new_wallet) {
      throw new Error('Mục tiêu tiết kiệm phải liên kết với một ví (walletId hoặc create_new_wallet = true).');
    }

    const goal = this.goalRepo.create({
      name: dto.name,
      user,
      target: dto.target ?? 0,
      saved_amount: dto.saved_amount ?? 0,
      template_key: dto.template_key ?? null,
      start_date: dto.start_date ? new Date(dto.start_date) : new Date(),
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      wallet: dto.walletId ? { id: dto.walletId } : null,
    } as Partial<SavingGoal>);

    if (dto.create_new_wallet) {
      const newWallet = this.walletRepo.create({
        name: `Ví ${dto.name}`,
        user: user,
        balance: 0,
        is_active: true,
        type: 'saving',
      });
      const savedWallet = await this.walletRepo.save(newWallet);
      goal.wallet = savedWallet;
    }

    const savedGoal = await this.goalRepo.save(goal);
    // Reload to get wallet relations for response
    const reloadedGoal = await this.goalRepo.findOne({
      where: { id: savedGoal.id },
      relations: ['wallet'],
    });
    if (reloadedGoal) {
      reloadedGoal.saved_amount = reloadedGoal.wallet?.balance || 0;
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: plainToInstance(SavingGoalResponseDto, reloadedGoal),
    });
  }

  async findAllByUser(userId: number): Promise<ApiResponse<SavingGoal[]>> {
    const goals = await this.goalRepo.find({
      where: { user: { id: userId } },
      relations: ['wallet'],
      order: { created_at: 'DESC' },
    });

    const goalsWithBalance = goals.map(goal => {
      goal.saved_amount = goal.wallet?.balance || 0;
      return goal;
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: goalsWithBalance,
    });
  }

  async findOne(id: number, userId?: number): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['wallet'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');
    
    goal.saved_amount = goal.wallet?.balance || 0;

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: goal,
    });
  }

  async update(
    id: number,
    dto: UpdateSavingGoalDto,
    userId?: number,
  ): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['wallet'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    if (dto.name) goal.name = dto.name;
    if (dto.is_selected !== undefined) goal.is_selected = dto.is_selected;
    if (dto.target !== undefined && dto.target !== null)
      goal.target = dto.target;
    if (dto.saved_amount !== undefined && dto.saved_amount !== null)
      goal.saved_amount = dto.saved_amount;
    if (dto.template_key !== undefined) goal.template_key = dto.template_key;
    if (dto.start_date) goal.start_date = new Date(dto.start_date);
    if (dto.end_date) goal.end_date = new Date(dto.end_date);
    if (dto.is_completed !== undefined) {
      goal.is_completed = dto.is_completed;
      if (dto.is_completed) {
        goal.is_selected = false;
        goal.status = SavingGoalStatus.COMPLETED;
      }
    }
    if (dto.walletId !== undefined) {
      goal.wallet = dto.walletId ? ({ id: dto.walletId } as any) : null;
    }



    const updated = await this.goalRepo.save(goal);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  async remove(id: number, userId?: number): Promise<ApiResponse<string>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
    });
    if (!goal) throw new NotFoundException('Saving goal not found');
    await this.goalRepo.remove(goal);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

  async selectGoal(
    userId: number,
    id: number,
  ): Promise<ApiResponse<SavingGoal | null>> {
    const selectedGoals = await this.goalRepo.find({
      where: { user: { id: userId }, is_selected: true },
    });
    if (selectedGoals.length > 0) {
      selectedGoals.forEach((g) => (g.is_selected = false));
      await this.goalRepo.save(selectedGoals);
    }

    if (id <= 0) {
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: null,
      });
    }

    const goal = await this.goalRepo.findOne({
      where: { id, user: { id: userId } },
      relations: ['wallet'],
    });

    if (!goal) throw new NotFoundException('Saving goal not found');

    goal.is_selected = true;
    const updated = await this.goalRepo.save(goal);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  async getGoalReport(id: number, userId?: number) {
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
    let current_automated_balance = goal.wallet?.balance || 0;

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
    const startDate = goal.start_date ? this.setStartOfDay(goal.start_date) : null;
    let daysDiff = 1;
    if (startDate) {
      const diffMs = now.getTime() - startDate.getTime();
      daysDiff = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const currentMilestoneIndex = milestones.findIndex(
      (m) => now >= m.start_date && now < m.end_date,
    );
    const isLastMilestone = currentMilestoneIndex === milestones.length - 1;

    const isTargetAchieved = current_automated_balance >= target;
    const isPastEndDate = goal.end_date ? now >= goal.end_date : false;

    if (isTargetAchieved && !goal.is_completed && isPastEndDate) {
      goal.is_completed = true;
      goal.status = SavingGoalStatus.COMPLETED;

      // Deactivate wallet if linked
      if (goal.wallet) {
        await this.walletRepo.update(goal.wallet.id, { is_active: false });
      }

      await this.goalRepo.save(goal);
    }

    // --- Projection calculation ---
    const capacity = await this.spendingPlansService.getMonthlySavingCapacity(goal.user.id);
    let projection: any = null;
    if (capacity && capacity.monthlySavingCapacity > 0 && target > 0) {
      const remainingTarget = Math.max(0, target - current_automated_balance);
      const monthsRemaining = Math.ceil(remainingTarget / capacity.monthlySavingCapacity);
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
      transactions: transactions.map(t => ({
        id: t.id,
        amount: t.amount,
        type: t.type,
        transaction_date: t.transaction_date,
        note: t.note,
        category: t.category ? {
          id: t.category.id,
          name: t.category.name,
          icon: t.category.icon,
          type: t.category.type,
        } : null,
        wallet: t.wallet ? { id: t.wallet.id, name: t.wallet.name } : null,
      })),
    };

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: report,
    });
  }

  private calculateMilestones(goal: SavingGoal, transactions: Transaction[]) {
    if (!goal.start_date || !goal.end_date) return [];

    const start = this.setStartOfDay(goal.start_date);
    const end = this.setEndOfDay(goal.end_date);
    
    // Calculate total duration in days
    const totalDiffMs = end.getTime() - start.getTime();
    const totalDays = Math.max(1, Math.ceil(totalDiffMs / (1000 * 60 * 60 * 24)));

    const milestoneDates: Date[] = [];
    let current = new Date(start);
    
    milestoneDates.push(new Date(start));
    
    // Add the 1st of each subsequent month
    let nextMonth = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    while (nextMonth < end) {
      milestoneDates.push(new Date(nextMonth));
      nextMonth = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 1);
    }
    
    milestoneDates.push(new Date(end));

    const totalTarget = Number(goal.target ?? 0);
    const results: any[] = [];

    for (let i = 0; i < milestoneDates.length - 1; i++) {
      const mStart = milestoneDates[i];
      const mEnd = milestoneDates[i + 1];

      // Calculate days in this specific segment
      const segmentDiffMs = mEnd.getTime() - mStart.getTime();
      const segmentDays = Math.ceil(segmentDiffMs / (1000 * 60 * 60 * 24));
      
      // Calculate proportional target for this segment
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

  async checkExpiredGoal(userId: number) {
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: { has_expired_fund: false },
    });
  }

  async markAsNotified(id: number, userId?: number) {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
    });
    if (!goal) throw new NotFoundException('Saving goal not found');
    goal.completion_notified = true;
    await this.goalRepo.save(goal);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Marked as notified',
    });
  }

  async extendGoal(
    id: number,
    new_end_date: Date,
    new_start_date?: Date,
    userId?: number,
  ) {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    goal.end_date = new_end_date;
    if (new_start_date) goal.start_date = new_start_date;
    goal.status = SavingGoalStatus.ACTIVE;
    goal.completion_notified = false;

    const updated = await this.goalRepo.save(goal);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  private setStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private setEndOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
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
        startDate: this.setStartOfDay(startDate),
      });
    }
    if (endDate) {
      query.andWhere('t.transaction_date <= :endDate', {
        endDate: this.setEndOfDay(endDate),
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

  private async calculateGoalBalance(
    goalId: number,
    userId: number,
    startDate?: Date,
    endDate?: Date,
    walletId?: number,
  ): Promise<number> {
    const query = this.transactionRepo
      .createQueryBuilder('t')
      .select(
        "SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)",
        'balance',
      )
      .where('t.userId = :userId', { userId });

    if (walletId) {
      query.andWhere('t.walletId = :walletId', { walletId });
    }

    if (startDate) {
      query.andWhere('t.transaction_date >= :startDate', { 
        startDate: this.setStartOfDay(startDate),
      });
    }
    if (endDate) {
      query.andWhere('t.transaction_date <= :endDate', {
        endDate: this.setEndOfDay(endDate),
      });
    }

    const result = await query.getRawOne();
    return Number(result?.balance ?? 0);
  }
}
