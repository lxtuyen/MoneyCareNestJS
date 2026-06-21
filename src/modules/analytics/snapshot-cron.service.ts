import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { SnapshotService } from './snapshot.service';
import { AnalyticsPayloadBuilderService } from './analytics-payload-builder.service';
import { AnalyticsServiceClient } from './analytics-service-client.service';

@Injectable()
export class SnapshotCronService {
  private readonly logger = new Logger(SnapshotCronService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly snapshotService: SnapshotService,
    private readonly payloadBuilder: AnalyticsPayloadBuilderService,
    private readonly serviceClient: AnalyticsServiceClient,
  ) {}

  /**
   * Chạy 00:05 ngày 1 mỗi tháng (Vietnam timezone).
   * Đóng tháng trước cho tất cả users có giao dịch.
   */
  @Cron('5 0 1 * *')
  async handleMonthClose(): Promise<void> {
    const now = new Date();
    const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() = 0-11
    const lastYear =
      now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

    this.logger.log(
      `Starting month close cron for ${lastMonth}/${lastYear}...`,
    );

    try {
      // Lấy danh sách unique userIds có giao dịch
      const result = await this.transactionRepo
        .createQueryBuilder('t')
        .select('DISTINCT t.userId', 'userId')
        .getRawMany<{ userId: number }>();

      const userIds = result.map((r) => r.userId);
      this.logger.log(`Found ${userIds.length} users to process`);

      let successCount = 0;
      let errorCount = 0;

      for (const userId of userIds) {
        try {
          // 1. Đóng snapshot tháng trước (tính categoryStats)
          const snapshot = await this.snapshotService.closeMonth(
            userId,
            lastMonth,
            lastYear,
          );

          // 2. Gọi FastAPI để lấy AI analysis (optional, best-effort)
          try {
            const payload = await this.payloadBuilder.buildAnalyzePayload(
              userId,
              { month: lastMonth, year: lastYear },
            );

            const aiData = await this.serviceClient.analyzeFinancial(
              payload.requestData,
            );

            if (aiData) {
              snapshot.healthScore = aiData.financial_health_score ?? null;
              snapshot.cashFlowTrend = aiData.cash_flow_trend ?? null;
              snapshot.forecastData = aiData.forecasting ?? null;
              snapshot.budgetingData = aiData.ai_budgeting ?? null;
              snapshot.anomalies = aiData.anomalies ?? null;
              snapshot.insights = aiData.insights ?? null;

              await this.snapshotService['snapshotRepo'].save(snapshot);
            }
          } catch (aiError) {
            this.logger.warn(
              `AI analysis failed for user ${userId}: ${aiError.message}. Snapshot saved without AI data.`,
            );
          }

          successCount++;
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Error closing month for user ${userId}: ${error.message}`,
          );
        }
      }

      this.logger.log(
        `Month close cron completed: ${successCount} success, ${errorCount} errors`,
      );
    } catch (error) {
      this.logger.error(`Month close cron failed: ${error.message}`);
    }
  }

  /**
   * Migration endpoint — chạy 1 lần để tạo snapshots cho data hiện có.
   * Có thể gọi từ controller hoặc chạy thủ công.
   */
  async migrateAllUsers(): Promise<{ totalUsers: number; totalSnapshots: number }> {
    const result = await this.transactionRepo
      .createQueryBuilder('t')
      .select('DISTINCT t.userId', 'userId')
      .getRawMany<{ userId: number }>();

    const userIds = result.map((r) => r.userId);
    let totalSnapshots = 0;

    for (const userId of userIds) {
      const count = await this.snapshotService.migrateUserSnapshots(userId);
      totalSnapshots += count;
    }

    this.logger.log(
      `Migration completed: ${userIds.length} users, ${totalSnapshots} snapshots created`,
    );

    return { totalUsers: userIds.length, totalSnapshots };
  }
}
