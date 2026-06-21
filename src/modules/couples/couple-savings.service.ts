import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoupleSavingGoal } from './entities/couple-saving-goal.entity';
import { CoupleSavingGoalContribution } from './entities/couple-saving-goal-contribution.entity';
import { CoupleMember } from './entities/couple-member.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Category, CategoryType } from 'src/modules/categories/entities/category.entity';
import { Couple } from './entities/couple.entity';
import { CreateCoupleSavingGoalDto, AddContributionDto, UpdateCoupleSavingGoalDto } from './dto/saving-goal.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok, created } from 'src/common/utils/response.util';
import { SpendingPlansService } from '../spending-plans/spending-plans.service';

type MemberContribution = { userId: number; fullName: string; amount: number };

@Injectable()
export class CoupleSavingsService {
  constructor(
    @InjectRepository(CoupleSavingGoal)
    private readonly savingGoalRepo: Repository<CoupleSavingGoal>,

    @InjectRepository(CoupleSavingGoalContribution)
    private readonly contributionRepo: Repository<CoupleSavingGoalContribution>,

    @InjectRepository(CoupleMember)
    private readonly coupleMemberRepo: Repository<CoupleMember>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    private readonly spendingPlansService: SpendingPlansService,
  ) {}

  private async checkMembership(
    userId: number,
    coupleId: number,
  ): Promise<void> {
    const membership = await this.coupleMemberRepo.findOne({
      where: { userId, coupleId },
    });
    if (!membership) {
      throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
    }
  }

  private buildMemberContributions(
    members: CoupleMember[],
    contributions: CoupleSavingGoalContribution[],
  ): MemberContribution[] {
    const contribsByUser = contributions.reduce(
      (acc, curr) => {
        acc[curr.userId] = (acc[curr.userId] || 0) + Number(curr.amount);
        return acc;
      },
      {} as Record<number, number>,
    );

    return members.map((member) => {
      const userId = member.userId;
      const fullName =
        [member.user?.profile?.first_name, member.user?.profile?.last_name]
          .filter(Boolean)
          .join(' ') ||
        member.user?.email ||
        `User ${userId}`;

      return {
        userId,
        fullName,
        amount: contribsByUser[userId] || 0,
      };
    });
  }

  async create(
    dto: CreateCoupleSavingGoalDto,
    requestUserId: number,
  ): Promise<ApiResponse<CoupleSavingGoal>> {
    await this.checkMembership(requestUserId, dto.coupleId);

    const newWallet = this.walletRepo.create({
      name: `Ví tiết kiệm: ${dto.name}`,
      couple: { id: dto.coupleId } as Couple,
      coupleId: dto.coupleId,
      balance: 0,
      is_active: true,
    });
    const savedWallet = await this.walletRepo.save(newWallet);

    const goal = this.savingGoalRepo.create({
      name: dto.name,
      coupleId: dto.coupleId,
      target: dto.target,
      saved_amount: 0,
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      status: 'paused',
      wallet: savedWallet,
      walletId: savedWallet.id,
      is_budget_enabled: dto.is_budget_enabled ?? false,
    });

    const saved = await this.savingGoalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(requestUserId, {
      coupleSavingGoalId: saved.id,
      name: saved.name,
      target: Number(saved.target ?? 0),
      startDate: saved.createdAt ?? new Date(),
      endDate: saved.end_date,
      isBudgetEnabled: saved.is_budget_enabled,
      status: saved.status,
    });

    return created(saved);
  }

  async findAll(
    coupleId: number,
    requestUserId: number,
  ): Promise<ApiResponse<any[]>> {
    await this.checkMembership(requestUserId, coupleId);

    const goals = await this.savingGoalRepo.find({
      where: { coupleId },
      relations: ['wallet'],
      order: { createdAt: 'DESC' },
    });

    const members = await this.coupleMemberRepo.find({
      where: { coupleId },
      relations: ['user', 'user.profile'],
    });

    const result: any[] = [];
    for (const goal of goals) {
      if (goal.wallet && !goal.wallet.is_active) {
        goal.wallet = null;
        goal.walletId = null;
      }
      const contributions = await this.contributionRepo.find({
        where: { savingGoalId: goal.id },
        relations: ['user', 'user.profile'],
      });

      const displaySavedAmount = goal.wallet
        ? Number(goal.wallet.balance)
        : Number(goal.saved_amount);

      result.push({
        ...goal,
        saved_amount: displaySavedAmount,
        memberContributions: this.buildMemberContributions(
          members,
          contributions,
        ),
        contributions: contributions.map((contribution) => ({
          id: contribution.id,
          amount: Number(contribution.amount),
          userId: contribution.userId,
          createdAt: contribution.createdAt,
          fullName:
            [
              contribution.user?.profile?.first_name,
              contribution.user?.profile?.last_name,
            ]
              .filter(Boolean)
              .join(' ') ||
            contribution.user?.email ||
            `User ${contribution.userId}`,
        })),
      });
    }

    return ok(result);
  }

  async findOne(id: number, requestUserId: number): Promise<ApiResponse<any>> {
    const goal = await this.savingGoalRepo.findOne({
      where: { id },
      relations: ['wallet'],
    });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }
    if (goal.wallet && !goal.wallet.is_active) {
      goal.wallet = null;
      goal.walletId = null;
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    const members = await this.coupleMemberRepo.find({
      where: { coupleId: goal.coupleId },
      relations: ['user', 'user.profile'],
    });

    const contributions = await this.contributionRepo.find({
      where: { savingGoalId: id },
      relations: ['user', 'user.profile'],
      order: { createdAt: 'DESC' },
    });

    const displaySavedAmount = goal.wallet
      ? Number(goal.wallet.balance)
      : Number(goal.saved_amount);

    return ok({
      ...goal,
      saved_amount: displaySavedAmount,
      memberContributions: this.buildMemberContributions(
        members,
        contributions,
      ),
      contributions: contributions.map((contribution) => ({
        id: contribution.id,
        amount: Number(contribution.amount),
        userId: contribution.userId,
        createdAt: contribution.createdAt,
        fullName:
          [
            contribution.user?.profile?.first_name,
            contribution.user?.profile?.last_name,
          ]
            .filter(Boolean)
            .join(' ') ||
          contribution.user?.email ||
          `User ${contribution.userId}`,
      })),
    });
  }

  async contribute(
    id: number,
    dto: AddContributionDto,
    requestUserId: number,
  ): Promise<ApiResponse<any>> {
    const goal = await this.savingGoalRepo.findOne({
      where: { id },
      relations: ['wallet'],
    });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }
    if (goal.wallet && !goal.wallet.is_active) {
      goal.wallet = null;
      goal.walletId = null;
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    const user = await this.userRepo.findOne({ where: { id: requestUserId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy thành viên.');
    }

    // Physical money transfer if sourceWalletId is provided
    if (dto.sourceWalletId) {
      const sourceWallet = await this.walletRepo.findOne({
        where: { id: dto.sourceWalletId },
        relations: ['user'],
      });
      if (!sourceWallet) {
        throw new NotFoundException('Không tìm thấy ví trích tiền.');
      }

      if (sourceWallet.user && sourceWallet.user.id !== requestUserId) {
        throw new ForbiddenException(
          'Bạn không có quyền truy cập ví cá nhân này.',
        );
      }
      if (sourceWallet.coupleId) {
        await this.checkMembership(requestUserId, sourceWallet.coupleId);
      }

      if (Number(sourceWallet.balance) < dto.amount) {
        throw new BadRequestException('Số dư ví trích tiền không đủ.');
      }

      sourceWallet.balance = Number(sourceWallet.balance) - dto.amount;
      await this.walletRepo.save(sourceWallet);

      if (goal.wallet) {
        goal.wallet.balance = Number(goal.wallet.balance) + dto.amount;
        await this.walletRepo.save(goal.wallet);
      }

      // Create transaction pair
      let category = await this.categoryRepo.findOne({
        where: { name: 'Tiết kiệm' },
      });
      if (!category) {
        category = this.categoryRepo.create({
          name: 'Tiết kiệm',
          icon: '🐷',
          type: CategoryType.EXPENSE,
          is_system: true,
        });
        category = await this.categoryRepo.save(category);
      }

      const now = new Date();
      const outgoing = this.transactionRepo.create({
        amount: dto.amount,
        type: 'expense',
        transaction_date: now,
        note: `Đóng góp quỹ: ${goal.name}`,
        user: user,
        wallet: sourceWallet,
        category: category,
        isTransfer: false,
        coupleId: sourceWallet.coupleId || null,
        couple: sourceWallet.coupleId
          ? ({ id: sourceWallet.coupleId } as Couple)
          : null,
      });

      let incoming: Transaction | null = null;
      if (goal.wallet) {
        incoming = this.transactionRepo.create({
          amount: dto.amount,
          type: 'income',
          transaction_date: now,
          note: `Nhận đóng góp quỹ: ${goal.name}`,
          user: user,
          wallet: goal.wallet,
          category: category,
          isTransfer: true,
          coupleId: goal.coupleId,
          couple: { id: goal.coupleId } as Couple,
        });
      }

      await this.transactionRepo.save(
        incoming ? [outgoing, incoming] : [outgoing],
      );
    }

    const contribution = this.contributionRepo.create({
      savingGoalId: id,
      userId: requestUserId,
      amount: dto.amount,
    });

    await this.contributionRepo.save(contribution);

    const allContributions = await this.contributionRepo.find({
      where: { savingGoalId: id },
    });
    const totalSaved = allContributions.reduce(
      (sum, curr) => sum + Number(curr.amount),
      0,
    );

    goal.saved_amount = goal.wallet ? Number(goal.wallet.balance) : totalSaved;
    goal.status =
      goal.target && goal.saved_amount >= goal.target ? 'completed' : 'active';
    await this.savingGoalRepo.save(goal);

    return created({
      contribution,
      saved_amount: goal.saved_amount,
      status: goal.status,
    });
  }

  async update(
    id: number,
    dto: UpdateCoupleSavingGoalDto,
    requestUserId: number,
  ): Promise<ApiResponse<CoupleSavingGoal>> {
    const goal = await this.savingGoalRepo.findOne({
      where: { id },
      relations: ['wallet'],
    });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }
    if (goal.wallet && !goal.wallet.is_active) {
      goal.wallet = null;
      goal.walletId = null;
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    const savedAmount = goal.wallet
      ? Number(goal.wallet.balance)
      : Number(goal.saved_amount);
    const isCompleted =
      goal.status === 'completed' ||
      (goal.target && savedAmount >= goal.target);

    if (
      isCompleted &&
      (dto.name !== undefined ||
        dto.target !== undefined ||
        dto.end_date !== undefined)
    ) {
      throw new BadRequestException(
        'Không thể chỉnh sửa mục tiêu tiết kiệm đã hoàn thành.',
      );
    }

    if (dto.name) {
      goal.name = dto.name;
      if (goal.wallet) {
        goal.wallet.name = `Ví tiết kiệm: ${dto.name}`;
        await this.walletRepo.save(goal.wallet);
      }
    }
    if (dto.target !== undefined) {
      goal.target = dto.target;
    }
    if (dto.end_date !== undefined) {
      goal.end_date = dto.end_date ? new Date(dto.end_date) : null;
    }
    if (dto.is_budget_enabled !== undefined) {
      goal.is_budget_enabled = dto.is_budget_enabled;
    }

    if (dto.status !== undefined) {
      goal.status = dto.status;
    } else {
      const savedAmount = goal.wallet
        ? Number(goal.wallet.balance)
        : Number(goal.saved_amount);
      goal.status =
        goal.target && savedAmount >= goal.target ? 'completed' : 'active';
    }

    if (dto.completion_notified !== undefined) {
      goal.completion_notified = dto.completion_notified;
    }

    const saved = await this.savingGoalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(requestUserId, {
      coupleSavingGoalId: saved.id,
      name: saved.name,
      target: Number(saved.target ?? 0),
      startDate: saved.createdAt ?? new Date(),
      endDate: saved.end_date,
      isBudgetEnabled: saved.is_budget_enabled,
      status: saved.status,
    });

    return ok(saved);
  }

  async activateGoal(
    goalId: number,
    requestUserId: number,
  ): Promise<ApiResponse<CoupleSavingGoal>> {
    const goal = await this.savingGoalRepo.findOne({
      where: { id: goalId },
      relations: ['wallet'],
    });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    if (goal.status === 'completed') {
      throw new BadRequestException(
        'Không thể kích hoạt mục tiêu đã hoàn thành.',
      );
    }

    if (goal.status === 'active') {
      return ok(goal);
    }

    // Enforce max 1 active goal per couple
    const activeGoals = await this.savingGoalRepo.find({
      where: { coupleId: goal.coupleId, status: 'active' },
      select: ['id', 'name'],
    });

    if (activeGoals.length >= 1) {
      throw new BadRequestException({
        message:
          'Chỉ được tối đa 1 mục tiêu tiết kiệm hoạt động cùng lúc. Hãy tạm dừng mục tiêu đang hoạt động trước.',
        activeGoals: activeGoals.map((g) => ({ id: g.id, name: g.name })),
      });
    }

    goal.status = 'active';
    const updated = await this.savingGoalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(requestUserId, {
      coupleSavingGoalId: updated.id,
      name: updated.name,
      target: Number(updated.target ?? 0),
      startDate: updated.createdAt ?? new Date(),
      endDate: updated.end_date,
      isBudgetEnabled: updated.is_budget_enabled,
      status: updated.status,
    });

    return ok(updated);
  }

  async pauseGoal(
    goalId: number,
    requestUserId: number,
  ): Promise<ApiResponse<CoupleSavingGoal>> {
    const goal = await this.savingGoalRepo.findOne({
      where: { id: goalId },
      relations: ['wallet'],
    });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    if (goal.status === 'completed') {
      throw new BadRequestException(
        'Không thể tạm dừng mục tiêu đã hoàn thành.',
      );
    }

    if (goal.status === 'paused') {
      return ok(goal);
    }

    goal.status = 'paused';
    const updated = await this.savingGoalRepo.save(goal);

    await this.spendingPlansService.syncSavingsBudget(requestUserId, {
      coupleSavingGoalId: updated.id,
      name: updated.name,
      target: Number(updated.target ?? 0),
      startDate: updated.createdAt ?? new Date(),
      endDate: updated.end_date,
      isBudgetEnabled: false,
      status: updated.status,
    });

    return ok(updated);
  }

  async remove(
    id: number,
    requestUserId: number,
  ): Promise<ApiResponse<string>> {
    const goal = await this.savingGoalRepo.findOne({
      where: { id },
      relations: ['wallet'],
    });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    await this.spendingPlansService.syncSavingsBudget(requestUserId, {
      coupleSavingGoalId: goal.id,
      name: goal.name,
      target: 0,
      startDate: new Date(),
      endDate: null,
      isBudgetEnabled: false,
    });

    const goalWallet = goal.wallet;
    if (goalWallet) {
      // Find default shared wallet "Ví chung"
      let defaultWallet = await this.walletRepo.findOne({
        where: { coupleId: goal.coupleId, name: 'Ví chung', is_active: true },
      });
      if (!defaultWallet) {
        // Fallback to any other active wallet for this couple
        defaultWallet = await this.walletRepo.findOne({
          where: { coupleId: goal.coupleId, is_active: true },
          order: { id: 'ASC' },
        });
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

        defaultWallet.balance =
          Number(defaultWallet.balance) + balanceAdjustment;
        await this.walletRepo.save(defaultWallet);
      }
    }

    // Delete saving goal first
    await this.savingGoalRepo.remove(goal);

    // Delete the goal wallet
    if (goalWallet) {
      await this.walletRepo.remove(goalWallet);
    }

    return ok('Đã xóa mục tiêu tiết kiệm chung thành công.');
  }
}
