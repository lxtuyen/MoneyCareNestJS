import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { AiPredictionRun } from './entities/ai-prediction-run.entity';
import {
  AnalyticsMappedAiBudgeting,
  AnalyticsMappedMonthlyForecast,
  AnalyticsMappedResponse,
} from './types/analytics-service-response.type';
import { AnalyticsPredictionMetadata } from './types/analytics-payload.type';
import { getVietnamMonthRange, getVietnamNow } from 'src/common/utils/date.util';

@Injectable()
export class AnalyticsPredictionService {
  private readonly logger = new Logger(AnalyticsPredictionService.name);

  constructor(
    @InjectRepository(AiPredictionRun)
    private readonly runRepo: Repository<AiPredictionRun>,
  ) {}

  /**
   * Entry point: lưu prediction run từ analytics response.
   * Gọi sau khi nhận response từ FastAPI hoặc fallback.
   */
  async logFromAnalyticsResponse(
    userId: number,
    mappedData: AnalyticsMappedResponse,
    metadata: AnalyticsPredictionMetadata,
  ): Promise<void> {
    const now = new Date();

    if (mappedData.forecasting) {
      if (mappedData.forecasting.currentMonthProjection) {
        await this.logForecastingRun(
          userId,
          mappedData.forecasting.currentMonthProjection,
          metadata,
          now,
        );
      }
      if (mappedData.forecasting.nextMonthForecast) {
        await this.logForecastingRun(
          userId,
          mappedData.forecasting.nextMonthForecast,
          metadata,
          now,
        );
      }
    }

    if (mappedData.aiBudgeting) {
      await this.logBudgetingRun(userId, mappedData.aiBudgeting, metadata, now);
    }
  }

  /**
   * Lưu forecasting prediction run với dedupe theo ngày.
   */
  async logForecastingRun(
    userId: number,
    forecasting: AnalyticsMappedMonthlyForecast,
    metadata: AnalyticsPredictionMetadata,
    now: Date,
  ): Promise<AiPredictionRun | null> {
    const modelName = forecasting.method || 'unknown';

    const targetStart = forecasting.periodStart
      ? new Date(forecasting.periodStart)
      : new Date(now);
    targetStart.setHours(0, 0, 0, 0);

    const targetEnd = forecasting.periodEnd
      ? new Date(forecasting.periodEnd)
      : new Date(targetStart);
    targetEnd.setHours(23, 59, 59, 999);

    const existing = await this.findExistingRunForToday(
      userId,
      'forecasting',
      modelName,
      targetStart,
    );
    if (existing) {
      // Update existing run thay vì tạo mới
      existing.predictionPayload = {
        totalForecast: forecasting.totalForecast,
        dailyPoints: forecasting.dailyPoints,
        categoryForecasts: forecasting.categoryForecasts,
        weeklyForecasts: forecasting.weeklyForecasts,
        riskWindows: forecasting.riskWindows,
      };
      existing.confidence = forecasting.confidence || 0;
      existing.inputSnapshot = metadata;
      await this.runRepo.save(existing);
      this.logger.log(
        `Updated existing forecasting run #${existing.id} for user ${userId}`,
      );
      return existing;
    }

    const inputPeriodEnd = new Date(now);
    const inputPeriodStart = new Date(now);
    inputPeriodStart.setFullYear(inputPeriodStart.getFullYear() - 1);

    const run = this.runRepo.create({
      userId,
      modelType: 'forecasting',
      modelName,
      modelVersion: 'v2',
      inputPeriodStart,
      inputPeriodEnd,
      predictionTargetStart: targetStart,
      predictionTargetEnd: targetEnd,
      predictionPayload: {
        totalForecast: forecasting.totalForecast,
        dailyPoints: forecasting.dailyPoints,
        categoryForecasts: forecasting.categoryForecasts,
        weeklyForecasts: forecasting.weeklyForecasts,
        riskWindows: forecasting.riskWindows,
      },
      inputSnapshot: metadata,
      confidence: forecasting.confidence || 0,
      status: 'pending',
    });

    const saved = await this.runRepo.save(run);
    this.logger.log(
      `Logged forecasting run #${saved.id} for user ${userId}, model: ${modelName}`,
    );
    return saved;
  }

  /**
   * Lưu budgeting prediction run với dedupe theo ngày.
   */
  async logBudgetingRun(
    userId: number,
    budgeting: AnalyticsMappedAiBudgeting,
    metadata: AnalyticsPredictionMetadata,
    now: Date,
  ): Promise<AiPredictionRun | null> {
    const modelName = budgeting.method || 'unknown';

    const existing = await this.findExistingRunForToday(
      userId,
      'budgeting',
      modelName,
    );
    if (existing) {
      existing.predictionPayload = {
        recommendedTotalBudget: budgeting.recommendedTotalBudget,
        expectedSavingsAmount: budgeting.expectedSavingsAmount,
        items: budgeting.items,
      };
      existing.confidence =
        budgeting.confidence || budgeting.items?.[0]?.confidence || 0;
      existing.inputSnapshot = metadata;
      await this.runRepo.save(existing);
      this.logger.log(
        `Updated existing budgeting run #${existing.id} for user ${userId}`,
      );
      return existing;
    }

    // Target period: từ đầu tháng hiện tại đến cuối tháng (Vietnam timezone)
    const vnNow = getVietnamNow();
    const { start: targetStart, end: targetEnd } = getVietnamMonthRange(
      vnNow.getMonth() + 1,
      vnNow.getFullYear(),
    );

    const inputPeriodEnd = new Date(now);
    const inputPeriodStart = new Date(now);
    inputPeriodStart.setFullYear(inputPeriodStart.getFullYear() - 1);

    const run = this.runRepo.create({
      userId,
      modelType: 'budgeting',
      modelName,
      modelVersion: budgeting.modelVersion || 'v1',
      inputPeriodStart,
      inputPeriodEnd,
      predictionTargetStart: targetStart,
      predictionTargetEnd: targetEnd,
      predictionPayload: {
        recommendedTotalBudget: budgeting.recommendedTotalBudget,
        expectedSavingsAmount: budgeting.expectedSavingsAmount,
        items: budgeting.items,
      },
      inputSnapshot: metadata,
      confidence: budgeting.confidence || budgeting.items?.[0]?.confidence || 0,
      status: 'pending',
    });

    const saved = await this.runRepo.save(run);
    this.logger.log(
      `Logged budgeting run #${saved.id} for user ${userId}, model: ${modelName}`,
    );
    return saved;
  }

  /**
   * Kiểm tra dedupe: có run nào cùng user/modelType/modelName trong ngày hôm nay không.
   */
  async findExistingRunForToday(
    userId: number,
    modelType: string,
    modelName: string,
    predictionTargetStart?: Date,
  ): Promise<AiPredictionRun | null> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const whereClause: FindOptionsWhere<AiPredictionRun> = {
      userId,
      modelType: modelType as AiPredictionRun['modelType'],
      modelName,
      createdAt: Between(todayStart, todayEnd),
    };

    if (predictionTargetStart) {
      whereClause.predictionTargetStart = predictionTargetStart;
    }

    return this.runRepo.findOne({
      where: whereClause,
    });
  }

  /**
   * Tìm các prediction runs pending đã đến hạn evaluate.
   */
  async findDuePredictionRuns(limit: number = 50): Promise<AiPredictionRun[]> {
    const now = new Date();
    return this.runRepo
      .createQueryBuilder('run')
      .where('run.status = :status', { status: 'pending' })
      .andWhere('run.predictionTargetEnd < :now', { now })
      .orderBy('run.predictionTargetEnd', 'ASC')
      .limit(limit)
      .getMany();
  }

  /**
   * Đánh dấu run đã evaluated.
   */
  async markEvaluated(runId: number): Promise<void> {
    await this.runRepo.update(runId, { status: 'evaluated' });
  }

  /**
   * Đánh dấu run bị skipped (thiếu dữ liệu thực tế).
   */
  async markSkipped(runId: number): Promise<void> {
    await this.runRepo.update(runId, { status: 'skipped' });
  }
}
