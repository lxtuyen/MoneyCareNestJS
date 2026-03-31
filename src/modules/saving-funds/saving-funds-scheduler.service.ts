import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SavingFundsService } from './saving-funds.service';

@Injectable()
export class SavingFundsSchedulerService {
  private readonly logger = new Logger(SavingFundsSchedulerService.name);

  constructor(private readonly savingFundsService: SavingFundsService) {}

  /**
   * Run every day at midnight to check and update expired funds
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredFunds() {
    this.logger.log('Running scheduled job: Check expired saving funds');

    try {
      const updatedCount =
        await this.savingFundsService.updateExpiredFundsStatus();
      this.logger.log(`Successfully updated ${updatedCount} expired funds`);
    } catch (error) {
      this.logger.error('Error updating expired funds:', error);
    }
  }

  /**
   * Optional: Run every hour for more frequent checks
   * Uncomment if you want hourly checks instead of daily
   */
  // @Cron(CronExpression.EVERY_HOUR)
  // async handleExpiredFundsHourly() {
  //   this.logger.log('Running hourly check for expired saving funds');
  //   try {
  //     const updatedCount = await this.savingFundsService.updateExpiredFundsStatus();
  //     if (updatedCount > 0) {
  //       this.logger.log(`Updated ${updatedCount} expired funds`);
  //     }
  //   } catch (error) {
  //     this.logger.error('Error in hourly expired funds check:', error);
  //   }
  // }
}
