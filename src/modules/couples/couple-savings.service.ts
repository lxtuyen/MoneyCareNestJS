import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoupleSavingGoal } from './entities/couple-saving-goal.entity';
import { CoupleSavingGoalContribution } from './entities/couple-saving-goal-contribution.entity';
import { CoupleMember } from './entities/couple-member.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  CreateCoupleSavingGoalDto,
  AddContributionDto,
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

    const goal = this.savingGoalRepo.create({
      name: dto.name,
      coupleId: dto.coupleId,
      target: dto.target,
      saved_amount: 0,
      end_date: dto.end_date ? new Date(dto.end_date) : null,
      status: 'active',
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
      order: { createdAt: 'DESC' },
    });

    const result: any[] = [];
    for (const goal of goals) {
      const contributions = await this.contributionRepo.find({
        where: { savingGoalId: goal.id },
        relations: ['user', 'user.profile'],
      });

      result.push({
        ...goal,
        memberContributions: this.buildMemberContributions(contributions),
        contributions: [],
      });
    }

    return ok(result);
  }

  async findOne(id: number, requestUserId: number): Promise<ApiResponse<any>> {
    const goal = await this.savingGoalRepo.findOne({ where: { id } });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    const contributions = await this.contributionRepo.find({
      where: { savingGoalId: id },
      relations: ['user', 'user.profile'],
      order: { createdAt: 'DESC' },
    });

    return ok({
      ...goal,
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
    const goal = await this.savingGoalRepo.findOne({ where: { id } });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    const user = await this.userRepo.findOne({ where: { id: requestUserId } });
    if (!user) {
      throw new NotFoundException('Không tìm thấy thành viên.');
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

    goal.saved_amount = totalSaved;
    goal.status =
      goal.target && goal.saved_amount >= goal.target ? 'completed' : 'active';
    await this.savingGoalRepo.save(goal);

    return created({
      contribution,
      saved_amount: goal.saved_amount,
      status: goal.status,
    });
  }

  async remove(
    id: number,
    requestUserId: number,
  ): Promise<ApiResponse<string>> {
    const goal = await this.savingGoalRepo.findOne({ where: { id } });
    if (!goal) {
      throw new NotFoundException('Không tìm thấy mục tiêu tiết kiệm này.');
    }

    await this.checkMembership(requestUserId, goal.coupleId);

    await this.savingGoalRepo.remove(goal);
    return ok('Đã xóa mục tiêu tiết kiệm chung thành công.');
  }
}
