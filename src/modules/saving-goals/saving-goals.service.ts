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
  ) {}

  async create(dto: CreateSavingGoalDto, userId?: number): Promise<ApiResponse<SavingGoalResponseDto>> {
    const ownerId = userId ?? dto.userId;
    const user = await this.userRepo.findOne({ where: { id: ownerId } });
    if (!user) throw new NotFoundException('User not found');

    const goal = this.goalRepo.create({
      name: dto.name,
      user,
      target: dto.target ?? 0,
      saved_amount: dto.saved_amount ?? 0,
      template_key: dto.template_key ?? null,
      start_date: dto.start_date ? new Date(dto.start_date) : new Date(),
      end_date: dto.end_date ? new Date(dto.end_date) : null,
    } as Partial<SavingGoal>);

    if (dto.categoryIds?.length) {
      const categories = await this.categoryRepo.findBy({ id: In(dto.categoryIds) });
      goal.categories = categories;
    } else {
      goal.categories = [];
    }

    const savedGoal = await this.goalRepo.save(goal);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: plainToInstance(SavingGoalResponseDto, savedGoal),
    });
  }

  async findAllByUser(userId: number): Promise<ApiResponse<SavingGoal[]>> {
    const goals = await this.goalRepo.find({
      where: { user: { id: userId } },
      relations: ['categories'],
      order: { created_at: 'DESC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: goals,
    });
  }

  async findOne(id: number, userId?: number): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['categories'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: goal });
  }

  async update(id: number, dto: UpdateSavingGoalDto, userId?: number): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['categories'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    if (dto.name !== undefined) goal.name = dto.name;
    if (dto.is_selected !== undefined) goal.is_selected = dto.is_selected;
    if (dto.target !== undefined) goal.target = dto.target;
    if (dto.saved_amount !== undefined) goal.saved_amount = dto.saved_amount;
    if (dto.template_key !== undefined) goal.template_key = dto.template_key;
    if (dto.start_date !== undefined) goal.start_date = new Date(dto.start_date);
    if (dto.end_date !== undefined) goal.end_date = new Date(dto.end_date);
    if (dto.is_completed !== undefined) goal.is_completed = dto.is_completed;

    if (dto.categoryIds) {
      const categories = await this.categoryRepo.findBy({ id: In(dto.categoryIds) });
      goal.categories = categories;
    }

    const updated = await this.goalRepo.save(goal);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: updated });
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

  async selectGoal(userId: number, id: number): Promise<ApiResponse<SavingGoal | null>> {
    // Deselect others for this user
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
      relations: ['categories'],
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
      relations: ['categories', 'user'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    const categoryIds = goal.categories?.map((c) => c.id) || [];
    let current_automated_balance = 0;
    let transactions: Transaction[] = [];
    let income = 0;
    let expense = 0;
    let categoryMap = new Map<string, number>();

    if (categoryIds.length > 0) {
      const query = this.transactionRepo
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.category', 'category')
        .where('category.id IN (:...ids)', { ids: categoryIds })
        .andWhere('t.userId = :userId', { userId: goal.user.id });

      if (goal.start_date) {
        query.andWhere('t.transaction_date >= :startDate', { startDate: goal.start_date });
      }
      if (goal.end_date) {
        query.andWhere('t.transaction_date <= :endDate', { endDate: goal.end_date });
      }

      transactions = await query.getMany();
      
      transactions.forEach(t => {
        const amt = Number(t.amount);
        if (t.type === 'income') {
          income += amt;
        } else {
          expense += amt;
          const catName = t.category?.name || 'Khác';
          categoryMap.set(catName, (categoryMap.get(catName) || 0) + amt);
        }
      });

      current_automated_balance = income - expense;
    }

    // 2. Milestone logic
    const milestones = this.calculateMilestones(goal, transactions);

    const target = Number(goal.target ?? 0);
    const progress_percent = target > 0 ? Math.round((current_automated_balance / target) * 100) : 0;
    
    // 3. Additional Metrics
    const balanceUsagePercentage = income > 0 ? Math.round((expense / income) * 100) : (expense > 0 ? 100 : 0);
    const targetCompletionPercentage = target > 0 ? Math.round((current_automated_balance / target) * 100) : 0;
    
    const categoryBreakdown = Array.from(categoryMap.entries()).map(([name, total]) => ({
      category_name: name,
      total,
      percentage: expense > 0 ? Math.round((total / expense) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const now = new Date();
    const startDate = goal.start_date ? new Date(goal.start_date) : null;
    let daysDiff = 1;
    if (startDate) {
      const diffMs = now.getTime() - startDate.getTime();
      daysDiff = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }

    const report = {
      id: goal.id,
      name: goal.name,
      target,
      start_date: goal.start_date,
      end_date: goal.end_date,
      current_balance: current_automated_balance,
      progress_percent: Math.max(0, progress_percent),
      is_completed: current_automated_balance >= target,
      milestones,
      // Enhanced fields
      balanceUsagePercentage,
      totalSpent: expense,
      isOverBudget: expense > income && income > 0,
      targetCompletionPercentage: Math.max(0, targetCompletionPercentage),
      isTargetAchieved: current_automated_balance >= target,
      categoryBreakdown,
      totalTransactions: transactions.length,
      dailyAverageSpending: expense / daysDiff,
      remainingBudget: income - expense,
    };

    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: report });
  }

  private calculateMilestones(goal: SavingGoal, transactions: Transaction[]) {
    if (!goal.start_date || !goal.end_date) return [];

    const start = new Date(goal.start_date);
    const end = new Date(goal.end_date);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    const milestoneDates: Date[] = [];
    
    let current = new Date(start);
    // Move to the first day of the NEXT month for the first milestone break
    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);

    milestoneDates.push(new Date(start));
    while (current < end) {
      milestoneDates.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
    milestoneDates.push(new Date(end));

    const targetPerMilestone = Number(goal.target ?? 0) / (milestoneDates.length - 1);
    const results: any[] = [];

    for (let i = 0; i < milestoneDates.length - 1; i++) {
      const mStart = milestoneDates[i];
      const mEnd = milestoneDates[i + 1];

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
    // Legacy logic for compatibility - can be simplified
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: { has_expired_fund: false } });
  }

  async markAsNotified(id: number, userId?: number) {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
    });
    if (!goal) throw new NotFoundException('Saving goal not found');
    goal.completion_notified = true;
    await this.goalRepo.save(goal);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: 'Marked as notified' });
  }

  async extendGoal(id: number, new_end_date: Date, new_start_date?: Date, userId?: number) {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    goal.end_date = new_end_date;
    if (new_start_date) goal.start_date = new_start_date;
    goal.status = 'ACTIVE';
    goal.completion_notified = false;

    const updated = await this.goalRepo.save(goal);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: updated });
  }
}
