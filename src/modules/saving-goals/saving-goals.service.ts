import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { UpdateSavingGoalDto } from './dto/update-goal.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateSavingGoalDto } from './dto/create-goal.dto';
import { SavingGoalResponseDto } from './dto/goal-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { created, ok } from 'src/common/utils/response.util';
import { SavingGoalStatus } from './enums/saving-goal-status.enum';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { PersonalizationService } from 'src/modules/personalization/personalization.service';
import { BudgetSuggestionResponseDto } from './dto/budget-suggestion.dto';
import { SnapshotService } from 'src/modules/analytics/snapshot.service';
import { getVietnamNow } from 'src/common/utils/date.util';

@Injectable()
export class SavingGoalsService {
  private readonly logger = new Logger(SavingGoalsService.name);

  constructor(
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly spendingPlansService: SpendingPlansService,
    private readonly personalizationService: PersonalizationService,
    private readonly snapshotService: SnapshotService,
  ) {}

  private async invalidateAnalyticsCache(userId: number): Promise<void> {
    try {
      const now = getVietnamNow();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const snapshot = await this.snapshotService.getOrCreateSnapshot(
        userId,
        month,
        year,
      );
      snapshot.aiComputedAt = null;
      await this.snapshotService['snapshotRepo'].save(snapshot);
      this.logger.log(
        `Invalidated analytics cache for user ${userId} for ${month}/${year} due to saving goal change`,
      );
    } catch (e) {
      this.logger.warn(`Failed to invalidate analytics cache: ${e.message}`);
    }
  }

  async create(
    dto: CreateSavingGoalDto,
    userId?: number,
  ): Promise<ApiResponse<SavingGoalResponseDto>> {
    const ownerId = userId ?? dto.userId;
    const user = await this.userRepo.findOne({ where: { id: ownerId } });
    if (!user) throw new NotFoundException('User not found');

    const newWallet = this.walletRepo.create({
      name: `Ví ${dto.name}`,
      user: user,
      balance: 0,
      is_active: true,
    });
    const savedWallet = await this.walletRepo.save(newWallet);

    const goal = this.goalRepo.create({
      name: dto.name,
      user,
      target: dto.target ?? 0,
      saved_amount: dto.saved_amount ?? 0,
      start_date: dto.start_date ? new Date(dto.start_date) : new Date(),
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      wallet: savedWallet,
      is_budget_enabled: dto.is_budget_enabled ?? false,
      status: SavingGoalStatus.PAUSED,
    } as Partial<SavingGoal>);

    const savedGoal = await this.goalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(user.id, {
      savingGoalId: savedGoal.id,
      name: savedGoal.name,
      target: savedGoal.target ?? 0,
      startDate: savedGoal.start_date ?? new Date(),
      endDate: savedGoal.end_date,
      isBudgetEnabled: false,
      status: savedGoal.status,
    });

    // Invalidate analytics cache since a new goal is created
    await this.invalidateAnalyticsCache(user.id);

    const reloadedGoal = await this.goalRepo.findOne({
      where: { id: savedGoal.id },
      relations: ['wallet'],
    });
    if (reloadedGoal) {
      reloadedGoal.saved_amount = reloadedGoal.wallet?.balance || 0;
    }

    return created(plainToInstance(SavingGoalResponseDto, reloadedGoal));
  }

  async findAllByUser(userId: number): Promise<ApiResponse<SavingGoal[]>> {
    const goals = await this.goalRepo.find({
      where: { user: { id: userId } },
      relations: ['wallet'],
      order: { created_at: 'DESC' },
    });

    const goalsWithBalance = goals.map((goal) => {
      goal.saved_amount = goal.wallet?.balance || 0;
      return goal;
    });

    return ok(goalsWithBalance);
  }

  async findOne(id: number, userId?: number): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['wallet'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    goal.saved_amount = goal.wallet?.balance || 0;

    return ok(goal);
  }

  async update(
    id: number,
    dto: UpdateSavingGoalDto,
    userId?: number,
  ): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['wallet', 'user'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    if (dto.walletId !== undefined) {
      throw new BadRequestException(
        'Updating wallet is not allowed for saving goals',
      );
    }

    const isCompleted =
      goal.is_completed ||
      (goal.target &&
        (goal.wallet?.balance || goal.saved_amount) >= goal.target);
    if (
      isCompleted &&
      (dto.name !== undefined ||
        dto.target !== undefined ||
        dto.start_date !== undefined ||
        dto.end_date !== undefined)
    ) {
      throw new BadRequestException(
        'Không thể chỉnh sửa mục tiêu tiết kiệm đã hoàn thành.',
      );
    }

    if (dto.name) goal.name = dto.name;
    if (dto.is_selected !== undefined) goal.is_selected = dto.is_selected;
    if (dto.target !== undefined && dto.target !== null)
      goal.target = dto.target;
    if (dto.saved_amount !== undefined && dto.saved_amount !== null)
      goal.saved_amount = dto.saved_amount;

    if (dto.start_date) goal.start_date = new Date(dto.start_date);
    if (dto.end_date) goal.end_date = new Date(dto.end_date);
    if (dto.is_budget_enabled !== undefined) {
      goal.is_budget_enabled = dto.is_budget_enabled;
    }
    if (dto.is_completed !== undefined) {
      goal.is_completed = dto.is_completed;
      if (dto.is_completed) {
        goal.is_selected = false;
        goal.status = SavingGoalStatus.COMPLETED;
      }
    }

    const updated = await this.goalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(goal.user.id, {
      savingGoalId: updated.id,
      name: updated.name,
      target: updated.target ?? 0,
      startDate: updated.start_date ?? new Date(),
      endDate: updated.end_date,
      isBudgetEnabled: updated.status === SavingGoalStatus.ACTIVE ? updated.is_budget_enabled : false,
    });

    // Invalidate analytics cache since the goal is updated
    await this.invalidateAnalyticsCache(goal.user.id);

    return ok(updated);
  }

  async remove(id: number, userId?: number): Promise<ApiResponse<string>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['wallet', 'user'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    const ownerId = userId ?? goal.user?.id;
    const goalWallet = goal.wallet;

    if (ownerId) {
      await this.spendingPlansService.syncSavingsBudget(ownerId, {
        savingGoalId: goal.id,
        name: goal.name,
        target: 0,
        startDate: new Date(),
        endDate: null,
        isBudgetEnabled: false,
      });
    }

    if (ownerId && goalWallet) {
      // Find default/main wallet "Ví 1"
      let defaultWallet = await this.walletRepo.findOne({
        where: { user: { id: ownerId }, name: 'Ví 1', is_active: true },
      });

      // Fallback to the first active wallet that is not a saving goal wallet
      if (!defaultWallet) {
        const allActiveWallets = await this.walletRepo.find({
          where: { user: { id: ownerId }, is_active: true },
          order: { id: 'ASC' },
          relations: ['savingGoals'],
        });
        defaultWallet =
          allActiveWallets.find(
            (w) => !w.savingGoals || w.savingGoals.length === 0,
          ) || allActiveWallets[0];
      }

      if (defaultWallet && goalWallet.id !== defaultWallet.id) {
        // Move all transactions in goal wallet to the default wallet
        const transactions = await this.transactionRepo.find({
          where: { wallet: { id: goalWallet.id } },
        });

        let balanceAdjustment = 0;
        for (const tx of transactions) {
          tx.wallet = defaultWallet;
          const amt = Number(tx.amount);
          if (tx.type === 'income') {
            balanceAdjustment += amt;
          } else if (tx.type === 'expense') {
            balanceAdjustment -= amt;
          }
        }

        if (transactions.length > 0) {
          await this.transactionRepo.save(transactions);
        }

        // Adjust default wallet balance
        defaultWallet.balance =
          Number(defaultWallet.balance) + balanceAdjustment;
        await this.walletRepo.save(defaultWallet);
      }
    }

    // Delete saving goal first
    await this.goalRepo.remove(goal);

    // Delete the goal wallet
    if (goalWallet) {
      await this.walletRepo.remove(goalWallet);
    }

    if (ownerId) {
      await this.invalidateAnalyticsCache(ownerId);
    }

    return ok('Deleted successfully');
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
      return ok(null);
    }

    const goal = await this.goalRepo.findOne({
      where: { id, user: { id: userId } },
      relations: ['wallet'],
    });

    if (!goal) throw new NotFoundException('Saving goal not found');

    goal.is_selected = true;
    const updated = await this.goalRepo.save(goal);

    await this.invalidateAnalyticsCache(userId);

    return ok(updated);
  }

  async markAsNotified(
    id: number,
    userId?: number,
  ): Promise<ApiResponse<string>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
    });
    if (!goal) throw new NotFoundException('Saving goal not found');
    goal.completion_notified = true;
    await this.goalRepo.save(goal);
    return ok('Marked as notified');
  }

  async extendGoal(
    id: number,
    new_end_date: Date,
    new_start_date?: Date,
    userId?: number,
  ): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['user', 'wallet'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    const ownerId = userId ?? goal.user?.id;
    if (!ownerId) throw new BadRequestException('User owner not found');

    const activeGoals = await this.goalRepo.find({
      where: {
        user: { id: ownerId },
        is_completed: false,
        status: SavingGoalStatus.ACTIVE,
      },
    });
    // Auto-pause other active goals (limit: 1 active goal)
    for (const ag of activeGoals) {
      if (ag.id !== goal.id) {
        ag.status = SavingGoalStatus.PAUSED;
        await this.goalRepo.save(ag);
        await this.spendingPlansService.syncSavingsBudget(ownerId, {
          savingGoalId: ag.id,
          name: ag.name,
          target: ag.target ?? 0,
          startDate: ag.start_date ?? new Date(),
          endDate: ag.end_date,
          isBudgetEnabled: false,
          status: SavingGoalStatus.PAUSED,
        });
      }
    }

    goal.end_date = new_end_date;
    if (new_start_date) goal.start_date = new_start_date;
    goal.status = SavingGoalStatus.ACTIVE;
    goal.completion_notified = false;

    const updated = await this.goalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(ownerId, {
      savingGoalId: updated.id,
      name: updated.name,
      target: updated.target ?? 0,
      startDate: updated.start_date ?? new Date(),
      endDate: updated.end_date,
      isBudgetEnabled: updated.is_budget_enabled,
      status: updated.status,
    });

    await this.invalidateAnalyticsCache(ownerId);

    return ok(updated);
  }

  async getActiveGoalCount(userId: number): Promise<number> {
    return this.goalRepo.count({
      where: {
        user: { id: userId },
        is_completed: false,
        status: SavingGoalStatus.ACTIVE,
      },
    });
  }

  async activateGoal(
    userId: number,
    goalId: number,
  ): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: { id: goalId, user: { id: userId } },
      relations: ['wallet', 'user'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    if (goal.is_completed) {
      throw new BadRequestException('Không thể kích hoạt mục tiêu đã hoàn thành.');
    }

    if (goal.status === SavingGoalStatus.ACTIVE) {
      return ok(goal);
    }

    const activeGoals = await this.goalRepo.find({
      where: {
        user: { id: userId },
        is_completed: false,
        status: SavingGoalStatus.ACTIVE,
      },
      select: ['id', 'name'],
    });

    // Auto-pause other active goals (limit: 1 active goal)
    for (const ag of activeGoals) {
      ag.status = SavingGoalStatus.PAUSED;
      await this.goalRepo.save(ag);
      await this.spendingPlansService.syncSavingsBudget(userId, {
        savingGoalId: ag.id,
        name: ag.name,
        target: ag.target ?? 0,
        startDate: ag.start_date ?? new Date(),
        endDate: ag.end_date,
        isBudgetEnabled: false,
        status: SavingGoalStatus.PAUSED,
      });
    }

    goal.status = SavingGoalStatus.ACTIVE;
    const updated = await this.goalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(userId, {
      savingGoalId: updated.id,
      name: updated.name,
      target: updated.target ?? 0,
      startDate: updated.start_date ?? new Date(),
      endDate: updated.end_date,
      isBudgetEnabled: updated.is_budget_enabled,
      status: updated.status,
    });

    return ok(updated);
  }

  async pauseGoal(
    userId: number,
    goalId: number,
  ): Promise<ApiResponse<SavingGoal>> {
    const goal = await this.goalRepo.findOne({
      where: { id: goalId, user: { id: userId } },
      relations: ['wallet', 'user'],
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    if (goal.is_completed) {
      throw new BadRequestException('Không thể tạm dừng mục tiêu đã hoàn thành.');
    }

    if (goal.status === SavingGoalStatus.PAUSED) {
      return ok(goal);
    }

    goal.status = SavingGoalStatus.PAUSED;
    const updated = await this.goalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(userId, {
      savingGoalId: updated.id,
      name: updated.name,
      target: updated.target ?? 0,
      startDate: updated.start_date ?? new Date(),
      endDate: updated.end_date,
      isBudgetEnabled: false,
      status: updated.status,
    });

    return ok(updated);
  }

  async getBudgetSuggestion(
    userId: number,
    target?: number,
    startDate?: string,
    endDate?: string,
  ): Promise<ApiResponse<BudgetSuggestionResponseDto>> {
    const profile = await this.personalizationService.getOrBuildProfile(userId);
    const averageMonthlySavings = profile?.averageMonthlySavings ? Number(profile.averageMonthlySavings) : 0;
    const confidenceScore = profile?.confidenceScore ? Number(profile.confidenceScore) : 0;

    const existingGoals = await this.goalRepo.find({
      where: {
        user: { id: userId },
        is_completed: false,
        is_budget_enabled: true,
        status: SavingGoalStatus.ACTIVE,
      },
    });

    const existingGoalsWithBudget = existingGoals.map((goal) => {
      let monthlyBudget = 0;
      const start = goal.start_date ? new Date(goal.start_date) : new Date();
      const end = goal.end_date ? new Date(goal.end_date) : null;
      if (end && goal.target) {
        const segments = this.countMilestoneSegments(start, end);
        monthlyBudget = goal.target / segments;
      }
      return {
        id: goal.id,
        name: goal.name,
        monthlyBudget: Math.ceil(monthlyBudget),
      };
    });

    const totalExistingBudget = existingGoalsWithBudget.reduce(
      (sum, g) => sum + g.monthlyBudget,
      0,
    );

    const availableSavings = averageMonthlySavings - totalExistingBudget;

    let requiredMonthly = 0;
    if (target && startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const segments = this.countMilestoneSegments(start, end);
      requiredMonthly = target / segments;
    }
    requiredMonthly = Math.ceil(requiredMonthly);

    const isSufficient = availableSavings >= requiredMonthly;
    const deficit = isSufficient ? 0 : Math.round(requiredMonthly - availableSavings);

    const suggestion: BudgetSuggestionResponseDto = {
      averageMonthlySavings: Math.round(averageMonthlySavings),
      totalExistingBudget: Math.round(totalExistingBudget),
      availableSavings: Math.round(availableSavings),
      requiredMonthly,
      isSufficient,
      deficit,
      existingGoals: existingGoalsWithBudget,
      confidenceScore,
    };

    return ok(suggestion);
  }

  /**
   * Đếm số milestone segments giữa start và end.
   * Mỗi đầu tháng là 1 boundary → segments = boundaries - 1.
   * Giống logic calculateMilestones trong AiGoalAchievementChatService.
   */
  private countMilestoneSegments(start: Date, end: Date): number {
    const milestoneDates: Date[] = [start];
    let next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    const endStartOfDay = new Date(
      end.getFullYear(),
      end.getMonth(),
      end.getDate(),
    );
    while (next < endStartOfDay) {
      milestoneDates.push(new Date(next));
      next = new Date(next.getFullYear(), next.getMonth() + 1, 1);
    }
    milestoneDates.push(end);
    return Math.max(1, milestoneDates.length - 1);
  }
}
