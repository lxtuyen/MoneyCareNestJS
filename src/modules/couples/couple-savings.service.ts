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
import { Category } from 'src/modules/categories/entities/category.entity';
import { CategoryType } from 'src/modules/categories/entities/category-type.enum';
import { Couple } from './entities/couple.entity';
import {
  CreateCoupleSavingGoalDto,
  AddContributionDto,
  UpdateCoupleSavingGoalDto,
} from './dto/saving-goal.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok, created } from 'src/common/utils/response.util';

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
    contributions: CoupleSavingGoalContribution[],
  ): MemberContribution[] {
    const grouped = contributions.reduce(
      (acc, curr) => {
        const userId = curr.userId;
        const fullName =
          [curr.user?.profile?.first_name, curr.user?.profile?.last_name]
            .filter(Boolean)
            .join(' ') ||
          curr.user?.email ||
          `User ${userId}`;

        if (!acc[userId]) {
          acc[userId] = { userId, fullName, amount: 0 };
        }
        acc[userId].amount += Number(curr.amount);
        return acc;
      },
      {} as Record<number, MemberContribution>,
    );

    return Object.values(grouped);
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
      status: 'active',
      wallet: savedWallet,
      walletId: savedWallet.id,
    });

    const saved = await this.savingGoalRepo.save(goal);
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

    const result: any[] = [];
    for (const goal of goals) {
      const contributions = await this.contributionRepo.find({
        where: { savingGoalId: goal.id },
        relations: ['user', 'user.profile'],
      });

      const displaySavedAmount = goal.wallet ? Number(goal.wallet.balance) : Number(goal.saved_amount);

      result.push({
        ...goal,
        saved_amount: displaySavedAmount,
        memberContributions: this.buildMemberContributions(contributions),
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

    await this.checkMembership(requestUserId, goal.coupleId);

    const contributions = await this.contributionRepo.find({
      where: { savingGoalId: id },
      relations: ['user', 'user.profile'],
      order: { createdAt: 'DESC' },
    });

    const displaySavedAmount = goal.wallet ? Number(goal.wallet.balance) : Number(goal.saved_amount);

    return ok({
      ...goal,
      saved_amount: displaySavedAmount,
      memberContributions: this.buildMemberContributions(contributions),
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
        throw new ForbiddenException('Bạn không có quyền truy cập ví cá nhân này.');
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
        isTransfer: true,
        coupleId: sourceWallet.coupleId || null,
        couple: sourceWallet.coupleId ? { id: sourceWallet.coupleId } as Couple : null,
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

      await this.transactionRepo.save(incoming ? [outgoing, incoming] : [outgoing]);
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

    await this.checkMembership(requestUserId, goal.coupleId);

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

    const savedAmount = goal.wallet ? Number(goal.wallet.balance) : Number(goal.saved_amount);
    goal.status =
      goal.target && savedAmount >= goal.target ? 'completed' : 'active';

    const saved = await this.savingGoalRepo.save(goal);
    return ok(saved);
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

        defaultWallet.balance = Number(defaultWallet.balance) + balanceAdjustment;
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
