import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';

@Injectable()
export class AnalyticsEvaluationScheduler {
  private readonly logger = new Logger(AnalyticsEvaluationScheduler.name);

  constructor(
    private readonly evaluationService: AnalyticsEvaluationService,
  ) {}

  /**
   * Chạy lúc 2h sáng mỗi ngày.
   * Tìm và đánh giá tất cả prediction runs đến hạn.
   */
  @Cron('0 2 * * *')
  async evaluateDuePredictions(): Promise<void> {
    this.logger.log('Starting scheduled prediction evaluation...');
    try {
      const count = await this.evaluationService.evaluateDuePredictions();
      this.logger.log(`Scheduled evaluation completed: ${count} runs evaluated`);
    } catch (error) {
      this.logger.error(`Scheduled evaluation failed: ${error.message}`);
    }
  }
}
