import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPredictionRun } from './entities/ai-prediction-run.entity';
import { AiPredictionEvaluation } from './entities/ai-prediction-evaluation.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { AnalyticsPredictionService } from './analytics-prediction.service';
import {
  AnalyticsModelTrainingService,
  MAPE_RETRAIN_THRESHOLD,
} from './analytics-model-training.service';
import {
  meanAbsoluteError,
  rootMeanSquaredError,
  meanAbsolutePercentageError,
  PredictedActualPair,
} from './utils/model-metrics.util';
import {
  calculateForecastingMetrics,
  calculateBudgetingMetrics,
} from './utils/evaluation-calculators';
import {
  ModelEvaluationSummaryDto,
  ForecastingSummaryDto,
  BudgetingSummaryDto,
  ForecastingEvaluationDetailDto,
  ForecastingRecentRunDto,
  CategoryMetricDto,
  BudgetingEvaluationDetailDto,
  BudgetingRecentRunDto,
} from './dto/model-evaluation-response.dto';

@Injectable()
export class AnalyticsEvaluationService {
  private readonly logger = new Logger(AnalyticsEvaluationService.name);

  constructor(
    @InjectRepository(AiPredictionEvaluation)
    private readonly evalRepo: Repository<AiPredictionEvaluation>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly predictionService: AnalyticsPredictionService,
    private readonly modelTrainingService: AnalyticsModelTrainingService,
  ) {}

  /**
   * Evaluate tất cả prediction runs đến hạn.
   */
  async evaluateDuePredictions(
    userId?: number,
    modelType?: string,
  ): Promise<number> {
    const dueRuns = await this.predictionService.findDuePredictionRuns(50);

    let evaluatedCount = 0;
    for (const run of dueRuns) {
      if (userId && run.userId !== userId) continue;
      if (modelType && run.modelType !== modelType) continue;

      try {
        if (run.modelType === 'forecasting') {
          await this.evaluateForecastingRun(run);
        } else if (run.modelType === 'budgeting') {
          await this.evaluateBudgetingRun(run);
        }
        evaluatedCount++;
      } catch (error) {
        this.logger.warn(`Error evaluating run #${run.id}: ${error.message}`);
      }
    }

    this.logger.log(`Evaluated ${evaluatedCount} prediction runs`);
    return evaluatedCount;
  }

  /**
   * Đánh giá một forecasting run.
   */
  async evaluateForecastingRun(run: AiPredictionRun): Promise<void> {
    const actualTransactions = await this.getActualTransactions(
      run.userId,
      run.predictionTargetStart,
      run.predictionTargetEnd,
    );

    if (actualTransactions.length === 0) {
      await this.predictionService.markSkipped(run.id);
      this.logger.log(`Skipped forecasting run #${run.id}: no actual data`);
      return;
    }

    const result = calculateForecastingMetrics(
      run.predictionPayload,
      actualTransactions,
    );

    const totalPair: PredictedActualPair = {
      predicted: result.predictedTotal,
      actual: result.actualTotalExpense,
    };
    const pairsForMetrics =
      result.dailyPairs.length > 0 ? result.dailyPairs : [totalPair];
    const mae = meanAbsoluteError(pairsForMetrics);
    const rmse = rootMeanSquaredError(pairsForMetrics);
    const mape = meanAbsolutePercentageError(pairsForMetrics);

    const totalErrorAmount = Math.abs(
      result.actualTotalExpense - result.predictedTotal,
    );
    const totalErrorPct =
      result.actualTotalExpense > 0
        ? Math.round((totalErrorAmount / result.actualTotalExpense) * 10000) /
          100
        : 0;

    const evaluation = this.evalRepo.create({
      predictionRunId: run.id,
      userId: run.userId,
      actualPayload: {
        actualTotalExpense: result.actualTotalExpense,
        actualDailyExpenses: Object.entries(result.dailyActual).map(
          ([date, amount]) => ({ date, amount }),
        ),
        actualCategoryExpenses: Object.entries(result.categoryActual).map(
          ([categoryName, amount]) => ({ categoryName, amount }),
        ),
      },
      metrics: {
        totalErrorAmount,
        totalErrorPct,
        categoryMetrics: result.categoryMetrics,
      },
      mae: Math.round(mae),
      rmse: Math.round(rmse),
      mape: Math.round(mape * 100) / 100,
      directionalAccuracy: null,
      evaluatedAt: new Date(),
    });

    await this.evalRepo.save(evaluation);
    await this.predictionService.markEvaluated(run.id);
    this.logger.log(
      `Evaluated forecasting run #${run.id}: MAE=${Math.round(mae)}, MAPE=${Math.round(mape * 100) / 100}%`,
    );

    if (mape > MAPE_RETRAIN_THRESHOLD) {
      this.logger.warn(
        `MAPE=${Math.round(mape * 100) / 100}% > ${MAPE_RETRAIN_THRESHOLD}% threshold for userId=${run.userId}. Triggering auto-retrain...`,
      );
      this.modelTrainingService
        .trainForecastingModel(run.userId)
        .then((r) => {
          this.logger.log(
            `Auto-retrain completed for userId=${run.userId}: status=${r.status}, artifactSaved=${r.artifactSaved}`,
          );
        })
        .catch((err) => {
          this.logger.error(
            `Auto-retrain failed for userId=${run.userId}: ${err.message}`,
          );
        });
    }
  }

  /**
   * Đánh giá một budgeting run.
   */
  async evaluateBudgetingRun(run: AiPredictionRun): Promise<void> {
    const actualTransactions = await this.getActualTransactions(
      run.userId,
      run.predictionTargetStart,
      run.predictionTargetEnd,
    );

    if (actualTransactions.length === 0) {
      await this.predictionService.markSkipped(run.id);
      this.logger.log(`Skipped budgeting run #${run.id}: no actual data`);
      return;
    }

    const result = calculateBudgetingMetrics(
      run.predictionPayload,
      actualTransactions,
    );

    const evaluation = this.evalRepo.create({
      predictionRunId: run.id,
      userId: run.userId,
      actualPayload: {
        actualTotalExpense: result.actualTotalExpense,
        actualCategoryExpenses: Object.entries(result.categoryActual).map(
          ([categoryName, amount]) => ({ categoryName, amount }),
        ),
      },
      metrics: {
        recommendedTotalBudget: result.recommendedTotal,
        actualTotalExpense: result.actualTotalExpense,
        overrunRate: Math.round(result.overrunRate * 10000) / 100,
        adoptionRate: Math.round(result.adoptionRate * 10000) / 100,
        averageOverrunAmount: Math.round(result.averageOverrunAmount),
        categoryDetails: result.categoryDetails,
      },
      mae: null,
      rmse: null,
      mape: null,
      directionalAccuracy: null,
      evaluatedAt: new Date(),
    });

    await this.evalRepo.save(evaluation);
    await this.predictionService.markEvaluated(run.id);
    this.logger.log(
      `Evaluated budgeting run #${run.id}: overrunRate=${Math.round(result.overrunRate * 100)}%`,
    );
  }

  // ── Private: shared transaction query ──

  private async getActualTransactions(
    userId: number,
    start: Date,
    end: Date,
  ): Promise<Transaction[]> {
    return this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .where('t.userId = :userId', { userId })
      .andWhere('t.type = :type', { type: 'expense' })
      .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
      .andWhere('t.transaction_date >= :start', { start })
      .andWhere('t.transaction_date <= :end', { end })
      .getMany();
  }

  /**
   * Lấy summary tổng hợp cho model evaluation API.
   */
  async getModelEvaluationSummary(
    userId: number,
  ): Promise<ModelEvaluationSummaryDto> {
    const forecastingSummary = await this.buildForecastingSummary(userId);
    const budgetingSummary = await this.buildBudgetingSummary(userId);

    return {
      forecasting: forecastingSummary,
      budgeting: budgetingSummary,
    };
  }

  /**
   * Lấy chi tiết forecasting evaluation.
   */
  async getForecastingEvaluation(
    userId: number,
  ): Promise<ForecastingEvaluationDetailDto> {
    const summary = await this.buildForecastingSummary(userId);

    // Recent runs
    const recentEvals = await this.evalRepo
      .createQueryBuilder('eval')
      .leftJoinAndSelect('eval.predictionRun', 'run')
      .where('eval.userId = :userId', { userId })
      .andWhere('run.modelType = :modelType', { modelType: 'forecasting' })
      .orderBy('eval.evaluatedAt', 'DESC')
      .limit(10)
      .getMany();

    const recentRuns: ForecastingRecentRunDto[] = recentEvals.map((ev) => ({
      runId: ev.predictionRunId,
      modelName: ev.predictionRun?.modelName || 'unknown',
      predictedTotal: ev.predictionRun?.predictionPayload?.totalForecast || 0,
      actualTotal: ev.actualPayload?.actualTotalExpense || 0,
      absoluteError: ev.metrics?.totalErrorAmount || 0,
      absolutePercentageError: ev.metrics?.totalErrorPct || 0,
      evaluatedAt: ev.evaluatedAt,
    }));

    // Category metrics aggregation
    const categoryMap: Record<string, { totalAPE: number; count: number }> = {};
    for (const ev of recentEvals) {
      const catMetrics = ev.metrics?.categoryMetrics || [];
      for (const cm of catMetrics) {
        if (
          cm.absolutePercentageError !== null &&
          cm.absolutePercentageError !== undefined
        ) {
          if (!categoryMap[cm.categoryName]) {
            categoryMap[cm.categoryName] = { totalAPE: 0, count: 0 };
          }
          categoryMap[cm.categoryName].totalAPE += cm.absolutePercentageError;
          categoryMap[cm.categoryName].count += 1;
        }
      }
    }

    const categoryMetrics: CategoryMetricDto[] = Object.entries(
      categoryMap,
    ).map(([categoryName, data]) => ({
      categoryName,
      mape: Math.round((data.totalAPE / data.count) * 100) / 100,
      evaluatedRuns: data.count,
    }));

    return {
      summary: summary || {
        evaluatedRuns: 0,
        latestModelName: '',
        mae: null,
        rmse: null,
        mape: null,
        directionalAccuracy: null,
        lastEvaluatedAt: null,
      },
      recentRuns,
      categoryMetrics,
    };
  }

  /**
   * Lấy chi tiết budgeting evaluation.
   */
  async getBudgetingEvaluation(
    userId: number,
  ): Promise<BudgetingEvaluationDetailDto> {
    const summary = await this.buildBudgetingSummary(userId);

    const recentEvals = await this.evalRepo
      .createQueryBuilder('eval')
      .leftJoinAndSelect('eval.predictionRun', 'run')
      .where('eval.userId = :userId', { userId })
      .andWhere('run.modelType = :modelType', { modelType: 'budgeting' })
      .orderBy('eval.evaluatedAt', 'DESC')
      .limit(10)
      .getMany();

    const recentRuns: BudgetingRecentRunDto[] = recentEvals.map((ev) => ({
      runId: ev.predictionRunId,
      recommendedTotalBudget: ev.metrics?.recommendedTotalBudget || 0,
      actualTotalExpense: ev.actualPayload?.actualTotalExpense || 0,
      overrunAmount: Math.max(
        0,
        (ev.actualPayload?.actualTotalExpense || 0) -
          (ev.metrics?.recommendedTotalBudget || 0),
      ),
      wasOverBudget:
        (ev.actualPayload?.actualTotalExpense || 0) >
        (ev.metrics?.recommendedTotalBudget || 0),
    }));

    return {
      summary: summary || {
        evaluatedRuns: 0,
        adoptionRate: null,
        overrunRate: null,
        averageOverrunAmount: null,
        lastEvaluatedAt: null,
      },
      recentRuns,
    };
  }

  // ── Private helpers ──

  private async buildForecastingSummary(
    userId: number,
  ): Promise<ForecastingSummaryDto | null> {
    const evals = await this.evalRepo
      .createQueryBuilder('eval')
      .leftJoinAndSelect('eval.predictionRun', 'run')
      .where('eval.userId = :userId', { userId })
      .andWhere('run.modelType = :modelType', { modelType: 'forecasting' })
      .orderBy('eval.evaluatedAt', 'DESC')
      .getMany();

    if (evals.length === 0) return null;

    const maes = evals.filter((e) => e.mae !== null).map((e) => e.mae!);
    const rmses = evals.filter((e) => e.rmse !== null).map((e) => e.rmse!);
    const mapes = evals.filter((e) => e.mape !== null).map((e) => e.mape!);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    return {
      evaluatedRuns: evals.length,
      latestModelName: evals[0].predictionRun?.modelName || 'unknown',
      mae: avg(maes) !== null ? Math.round(avg(maes)!) : null,
      rmse: avg(rmses) !== null ? Math.round(avg(rmses)!) : null,
      mape: avg(mapes) !== null ? Math.round(avg(mapes)! * 100) / 100 : null,
      directionalAccuracy: null, // Sẽ bổ sung khi có đủ previous runs
      lastEvaluatedAt: evals[0].evaluatedAt,
    };
  }

  private async buildBudgetingSummary(
    userId: number,
  ): Promise<BudgetingSummaryDto | null> {
    const evals = await this.evalRepo
      .createQueryBuilder('eval')
      .leftJoinAndSelect('eval.predictionRun', 'run')
      .where('eval.userId = :userId', { userId })
      .andWhere('run.modelType = :modelType', { modelType: 'budgeting' })
      .orderBy('eval.evaluatedAt', 'DESC')
      .getMany();

    if (evals.length === 0) return null;

    const overrunRates = evals
      .filter((e) => e.metrics?.overrunRate !== undefined)
      .map((e) => e.metrics.overrunRate);

    const overrunAmounts = evals
      .filter((e) => e.metrics?.averageOverrunAmount !== undefined)
      .map((e) => e.metrics.averageOverrunAmount);

    const adoptionRates = evals
      .filter((e) => e.metrics?.adoptionRate !== undefined)
      .map((e) => e.metrics.adoptionRate);

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    return {
      evaluatedRuns: evals.length,
      adoptionRate:
        avg(adoptionRates) !== null
          ? Math.round(avg(adoptionRates)! * 100) / 100
          : null,
      overrunRate:
        avg(overrunRates) !== null
          ? Math.round(avg(overrunRates)! * 100) / 100
          : null,
      averageOverrunAmount:
        avg(overrunAmounts) !== null ? Math.round(avg(overrunAmounts)!) : null,
      lastEvaluatedAt: evals[0].evaluatedAt,
    };
  }
}
