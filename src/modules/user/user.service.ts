import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ok } from 'src/common/utils/response.util';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SpendingPlan)
    private readonly spendingPlanRepo: Repository<SpendingPlan>,
  ) {}

  async completeInitialFinancialSetup(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const shouldRunInitialFinancialSetup =
      await this.shouldRunInitialFinancialSetup(userId);

    return ok({
      id: user.id,
      shouldRunInitialFinancialSetup,
    });
  }

  private async shouldRunInitialFinancialSetup(userId: number) {
    const planCount = await this.spendingPlanRepo.count({
      where: { user: { id: userId } },
    });

    return planCount === 0;
  }
}
