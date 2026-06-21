import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Couple } from '../couples/entities/couple.entity';

/** MAPE threshold (%) vượt ngưỡng này sẽ trigger auto-retrain */
export const MAPE_RETRAIN_THRESHOLD = 30;

/** Số giao dịch expense tối thiểu để user đủ điều kiện train */
const MIN_EXPENSE_TRANSACTIONS = 50;

export interface ForecastingTrainingResult {
  status: string;
  reason?: string | null;
  modelId: string;
  artifactSaved: boolean;
  artifactPath?: string | null;
  artifactScope?: string | null;
  metrics?: Record<string, number>;
  historyDays: number;
  trainingRows: number;
  minimumRequiredDays?: number | null;
  minimumRequiredTransactions?: number | null;
}

export interface BatchRetrainingResult {
  trained: number;
  skipped: number;
  failed: number;
}

@Injectable()
export class AnalyticsModelTrainingService {
  private readonly logger = new Logger(AnalyticsModelTrainingService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Couple)
    private readonly coupleRepo: Repository<Couple>,
    private readonly configService: ConfigService,
  ) {}

  async trainForecastingModel(
    userId: number,
  ): Promise<ForecastingTrainingResult> {
    this.logger.log(
      `Preparing forecasting training dataset for userId=${userId}`,
    );

    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const transactions = await this.transactionRepo.find({
      where: {
        user: { id: userId },
        transaction_date: Between(startDate, new Date()),
      },
      relations: ['category'],
      order: { transaction_date: 'ASC' },
    });

    const expenseCount = transactions.filter(
      (transaction) =>
        transaction.type === 'expense' && !transaction.isTransfer,
    ).length;
    const transferCount = transactions.filter(
      (transaction) => transaction.isTransfer,
    ).length;

    this.logger.log(
      `Loaded ${transactions.length} transactions for userId=${userId}; expense=${expenseCount}, transfer=${transferCount}, from=${startDate.toISOString()}`,
    );

    const requestData = {
      user_id: userId,
      scope: 'user',
      transactions: transactions.map((transaction) => ({
        id: transaction.id,
        amount: Number(transaction.amount),
        transaction_date: transaction.transaction_date,
        type: transaction.type,
        category: transaction.category
          ? {
              id: transaction.category.id,
              name: transaction.category.name,
              icon: transaction.category.icon,
              type: transaction.category.type,
            }
          : { name: 'Khác' },
        note: transaction.note || '',
        is_transfer: transaction.isTransfer || false,
      })),
    };

    const url =
      this.configService.get<string>('ANALYTICS_SERVICE_URL') ||
      'http://localhost:8000';
    const apiKey =
      this.configService.get<string>('ANALYTICS_SERVICE_API_KEY') || '';
    const timeoutMs = Number(
      this.configService.get<number>('ANALYTICS_SERVICE_TIMEOUT_MS') || 5000,
    );

    this.logger.log(
      `Calling FastAPI forecasting training endpoint: ${url}/v1/models/train/forecasting, timeoutMs=${timeoutMs}, hasApiKey=${Boolean(apiKey)}`,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.logger.warn(
        `FastAPI forecasting training timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    try {
      const response = await fetch(`${url}/v1/models/train/forecasting`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      this.logger.log(
        `FastAPI forecasting training responded with status=${response.status}`,
      );

      if (!response.ok) {
        const errorText = await response.text();
        const truncatedError = errorText.substring(0, 500);
        throw new Error(
          `HTTP error! status: ${response.status}, body=${truncatedError}`,
        );
      }

      const result = (await response.json()) as ForecastingTrainingResult;
      this.logger.log(
        `FastAPI forecasting training result for userId=${userId}: status=${result.status}, reason=${result.reason ?? 'none'}, artifactSaved=${result.artifactSaved}, historyDays=${result.historyDays}, trainingRows=${result.trainingRows}`,
      );
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      this.logger.error(`Cannot train forecasting model: ${error.message}`);
      throw error;
    }
  }

  /**
   * Lấy danh sách tất cả userId có đủ điều kiện train (>= MIN_EXPENSE_TRANSACTIONS).
   * Dùng cho weekly cron batch retraining.
   */
  async findEligibleUserIds(): Promise<number[]> {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const rows: { userId: number; cnt: string }[] = await this.transactionRepo
      .createQueryBuilder('t')
      .select('t.userId', 'userId')
      .addSelect('COUNT(*)', 'cnt')
      .where('t.type = :type', { type: 'expense' })
      .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
      .andWhere('t.transaction_date >= :startDate', { startDate })
      .groupBy('t.userId')
      .having('COUNT(*) >= :min', { min: MIN_EXPENSE_TRANSACTIONS })
      .getRawMany();

    return rows.map((r) => r.userId);
  }

  /**
   * Re-train model cho tất cả user đủ điều kiện.
   * Chạy tuần tự để tránh quá tải analytics service.
   */
  async retrainAllEligibleUsers(): Promise<BatchRetrainingResult> {
    const userIds = await this.findEligibleUserIds();
    this.logger.log(
      `Weekly retraining: found ${userIds.length} eligible users`,
    );

    const result: BatchRetrainingResult = { trained: 0, skipped: 0, failed: 0 };

    for (const userId of userIds) {
      try {
        const trainingResult = await this.trainForecastingModel(userId);
        if (trainingResult.status === 'trained') {
          result.trained++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `Retraining failed for userId=${userId}: ${error.message}`,
        );
      }
    }

    return result;
  }

  // ── Couple Forecasting Training ──

  async trainCoupleForecastingModel(
    coupleId: number,
  ): Promise<ForecastingTrainingResult> {
    this.logger.log(
      `Preparing couple forecasting training dataset for coupleId=${coupleId}`,
    );

    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const transactions = await this.transactionRepo.find({
      where: {
        coupleId,
        transaction_date: Between(startDate, new Date()),
      },
      relations: ['category'],
      order: { transaction_date: 'ASC' },
    });

    const expenseCount = transactions.filter(
      (tx) => tx.type === 'expense' && !tx.isTransfer,
    ).length;

    this.logger.log(
      `Loaded ${transactions.length} couple transactions for coupleId=${coupleId}; expense=${expenseCount}`,
    );

    const requestData = {
      couple_id: coupleId,
      transactions: transactions.map((tx) => ({
        id: tx.id,
        amount: Number(tx.amount),
        transaction_date: tx.transaction_date,
        type: tx.type,
        category: tx.category
          ? {
              id: tx.category.id,
              name: tx.category.name,
              icon: tx.category.icon,
              type: tx.category.type,
            }
          : { name: 'Khác' },
        note: tx.note || '',
        is_transfer: tx.isTransfer || false,
      })),
    };

    const url =
      this.configService.get<string>('ANALYTICS_SERVICE_URL') ||
      'http://localhost:8000';
    const apiKey =
      this.configService.get<string>('ANALYTICS_SERVICE_API_KEY') || '';
    const timeoutMs = Number(
      this.configService.get<number>('ANALYTICS_SERVICE_TIMEOUT_MS') || 5000,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.logger.warn(
        `FastAPI couple forecasting training timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    try {
      const response = await fetch(
        `${url}/v1/models/train/couple-forecasting`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(requestData),
          signal: controller.signal,
        },
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `HTTP error! status: ${response.status}, body=${errorText.substring(0, 500)}`,
        );
      }

      const result = (await response.json()) as ForecastingTrainingResult;
      this.logger.log(
        `Couple forecasting training result: coupleId=${coupleId}, status=${result.status}, artifactSaved=${result.artifactSaved}`,
      );
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      this.logger.error(
        `Cannot train couple forecasting model for coupleId=${coupleId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Lấy danh sách coupleId có đủ giao dịch expense để train.
   */
  async findEligibleCoupleIds(): Promise<number[]> {
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const rows: { coupleId: number; cnt: string }[] =
      await this.transactionRepo
        .createQueryBuilder('t')
        .select('t.coupleId', 'coupleId')
        .addSelect('COUNT(*)', 'cnt')
        .where('t.type = :type', { type: 'expense' })
        .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
        .andWhere('t.coupleId IS NOT NULL')
        .andWhere('t.transaction_date >= :startDate', { startDate })
        .groupBy('t.coupleId')
        .having('COUNT(*) >= :min', { min: MIN_EXPENSE_TRANSACTIONS })
        .getRawMany();

    return rows.map((r) => r.coupleId);
  }

  /**
   * Re-train forecasting model cho tất cả couple đủ điều kiện.
   */
  async retrainAllEligibleCouples(): Promise<BatchRetrainingResult> {
    const coupleIds = await this.findEligibleCoupleIds();
    this.logger.log(
      `Weekly couple retraining: found ${coupleIds.length} eligible couples`,
    );

    const result: BatchRetrainingResult = {
      trained: 0,
      skipped: 0,
      failed: 0,
    };

    for (const coupleId of coupleIds) {
      try {
        const trainingResult =
          await this.trainCoupleForecastingModel(coupleId);
        if (trainingResult.status === 'trained') {
          result.trained++;
        } else {
          result.skipped++;
        }
      } catch (error) {
        result.failed++;
        this.logger.warn(
          `Couple retraining failed for coupleId=${coupleId}: ${error.message}`,
        );
      }
    }

    return result;
  }
}
