import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SavingGoalsService } from './saving-goals.service';

@Injectable()
export class GoalsSchedulerService {
  private readonly logger = new Logger(GoalsSchedulerService.name);

  constructor(private readonly savingGoalsService: SavingGoalsService) {}

  /** Run every day at midnight to check and update expired goals */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredGoals() {
    this.logger.log('Running scheduled job: Check expired saving goals');
    // Implementation can be added back to SavingGoalsService if needed
  }
}
