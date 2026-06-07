import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SavingGoalsService } from './saving-goals.service';

@Injectable()
export class GoalsSchedulerService {
  constructor(private readonly savingGoalsService: SavingGoalsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredGoals() {}
}
