import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FundsService } from './funds.service';

@Injectable()
export class FundsSchedulerService {
  private readonly logger = new Logger(FundsSchedulerService.name);

  constructor(private readonly fundsService: FundsService) {}

  /** Run every day at midnight to check and update expired funds */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredFunds() {
    this.logger.log('Running scheduled job: Check expired saving funds');
    try {
      const updatedCount = await this.fundsService.updateExpiredFundsStatus();
      this.logger.log(`Successfully updated ${updatedCount} expired funds`);
    } catch (error) {
      this.logger.error('Error updating expired funds:', error);
    }
  }

  /** Reset monthly spending counters on the 1st of each month at midnight */
  @Cron('0 0 1 * *')
  async handleMonthlyReset() {
    this.logger.log('Running scheduled job: Reset monthly spending counters');
    try {
      await this.fundsService.resetMonthlyCounters();
      this.logger.log('Monthly spending counters reset successfully');
    } catch (error) {
      this.logger.error('Error resetting monthly counters:', error);
    }
  }
}
