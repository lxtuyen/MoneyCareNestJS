import {
  BadRequestException,
  Injectable,
  NotFoundException,
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

@Injectable()
export class SavingGoalsService {
  constructor(
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

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
    } as Partial<SavingGoal>);

    const savedGoal = await this.goalRepo.save(goal);
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
      relations: ['wallet'],
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
    if (dto.is_completed !== undefined) {
      goal.is_completed = dto.is_completed;
      if (dto.is_completed) {
        goal.is_selected = false;
        goal.status = SavingGoalStatus.COMPLETED;
      }
    }

    const updated = await this.goalRepo.save(goal);
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
    });
    if (!goal) throw new NotFoundException('Saving goal not found');

    goal.end_date = new_end_date;
    if (new_start_date) goal.start_date = new_start_date;
    goal.status = SavingGoalStatus.ACTIVE;
    goal.completion_notified = false;

    const updated = await this.goalRepo.save(goal);
    return ok(updated);
  }


}
