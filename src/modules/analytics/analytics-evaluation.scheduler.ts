import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';
import { AnalyticsModelTrainingService } from './analytics-model-training.service';

@Injectable()
export class AnalyticsEvaluationScheduler {
  private readonly logger = new Logger(AnalyticsEvaluationScheduler.name);

  constructor(
    private readonly evaluationService: AnalyticsEvaluationService,
    private readonly modelTrainingService: AnalyticsModelTrainingService,
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
      this.logger.log(
        `Scheduled evaluation completed: ${count} runs evaluated`,
      );
    } catch (error) {
      this.logger.error(`Scheduled evaluation failed: ${error.message}`);
    }
  }

  /**
   * Chạy lúc 3h sáng mỗi Chủ nhật.
   * Re-train forecasting model cho tất cả user đủ điều kiện.
   */
  @Cron('0 3 * * 0')
  async retrainForecastingModels(): Promise<void> {
    this.logger.log('Starting weekly forecasting model retraining...');
    try {
      const result = await this.modelTrainingService.retrainAllEligibleUsers();
      this.logger.log(
        `Weekly retraining completed: trained=${result.trained}, skipped=${result.skipped}, failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error(`Weekly retraining failed: ${error.message}`);
    }
  }

  /**
   * Chạy lúc 3h30 sáng mỗi Chủ nhật.
   * Re-train forecasting model cho tất cả couple đủ điều kiện.
   */
  @Cron('30 3 * * 0')
  async retrainCoupleForecastingModels(): Promise<void> {
    this.logger.log('Starting weekly couple forecasting model retraining...');
    try {
      const result =
        await this.modelTrainingService.retrainAllEligibleCouples();
      this.logger.log(
        `Weekly couple retraining completed: trained=${result.trained}, skipped=${result.skipped}, failed=${result.failed}`,
      );
    } catch (error) {
      this.logger.error(
        `Weekly couple retraining failed: ${error.message}`,
      );
    }
  }
}
