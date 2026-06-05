import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiPredictionRun } from './entities/ai-prediction-run.entity';
import { AiPredictionEvaluation } from './entities/ai-prediction-evaluation.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { AnalyticsPredictionService } from './analytics-prediction.service';
import {
  meanAbsoluteError,
  rootMeanSquaredError,
  meanAbsolutePercentageError,
  absolutePercentageError,
  directionalAccuracy,
  PredictedActualPair,
} from './utils/model-metrics.util';
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
  ) {}

  /**
   * Evaluate tất cả prediction runs đến hạn.
   */
  async evaluateDuePredictions(userId?: number, modelType?: string): Promise<number> {
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
    const actualTransactions = await this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .where('t.userId = :userId', { userId: run.userId })
      .andWhere('t.type = :type', { type: 'expense' })
      .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
      .andWhere('t.transaction_date >= :start', { start: run.predictionTargetStart })
      .andWhere('t.transaction_date <= :end', { end: run.predictionTargetEnd })
      .getMany();

    if (actualTransactions.length === 0) {
      await this.predictionService.markSkipped(run.id);
      this.logger.log(`Skipped forecasting run #${run.id}: no actual data`);
      return;
    }

    // Tính actual total
    const actualTotalExpense = actualTransactions.reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0,
    );

    // Actual daily expenses
    const dailyActual: Record<string, number> = {};
    for (const t of actualTransactions) {
      const dateStr = new Date(t.transaction_date).toISOString().split('T')[0];
      dailyActual[dateStr] = (dailyActual[dateStr] || 0) + Number(t.amount || 0);
    }

    // Actual category expenses
    const categoryActual: Record<string, number> = {};
    for (const t of actualTransactions) {
      const catName = t.category?.name || 'Khác';
      categoryActual[catName] = (categoryActual[catName] || 0) + Number(t.amount || 0);
    }

    const payload = run.predictionPayload;
    const predictedTotal = payload.totalForecast || 0;

    // Tổng hợp metrics
    const totalPair: PredictedActualPair = {
      predicted: predictedTotal,
      actual: actualTotalExpense,
    };

    // Daily pairs (nếu có dailyPoints)
    const dailyPairs: PredictedActualPair[] = [];
    if (payload.dailyPoints && Array.isArray(payload.dailyPoints)) {
      for (const dp of payload.dailyPoints) {
        const actual = dailyActual[dp.date] || 0;
        dailyPairs.push({ predicted: dp.predictedAmount || 0, actual });
      }
    }

    // Category pairs
    const categoryPairs: PredictedActualPair[] = [];
    const categoryMetricsDetail: any[] = [];
    if (payload.categoryForecasts && Array.isArray(payload.categoryForecasts)) {
      for (const cf of payload.categoryForecasts) {
        const actual = categoryActual[cf.categoryName] || 0;
        categoryPairs.push({ predicted: cf.predictedAmount || 0, actual });
        const ape = absolutePercentageError(cf.predictedAmount || 0, actual);
        categoryMetricsDetail.push({
          categoryName: cf.categoryName,
          predictedAmount: cf.predictedAmount || 0,
          actualAmount: actual,
          absoluteError: Math.abs(actual - (cf.predictedAmount || 0)),
          absolutePercentageError: ape !== null ? Math.round(ape * 100) / 100 : null,
        });
      }
    }

    // Tính metrics dựa trên total pair
    const pairsForMetrics = dailyPairs.length > 0 ? dailyPairs : [totalPair];
    const mae = meanAbsoluteError(pairsForMetrics);
    const rmse = rootMeanSquaredError(pairsForMetrics);
    const mape = meanAbsolutePercentageError(pairsForMetrics);

    const totalErrorAmount = Math.abs(actualTotalExpense - predictedTotal);
    const totalErrorPct = actualTotalExpense > 0
      ? Math.round((totalErrorAmount / actualTotalExpense) * 10000) / 100
      : 0;

    const evaluation = this.evalRepo.create({
      predictionRunId: run.id,
      userId: run.userId,
      actualPayload: {
        actualTotalExpense,
        actualDailyExpenses: Object.entries(dailyActual).map(([date, amount]) => ({ date, amount })),
        actualCategoryExpenses: Object.entries(categoryActual).map(([categoryName, amount]) => ({
          categoryName,
          amount,
        })),
      },
      metrics: {
        totalErrorAmount,
        totalErrorPct,
        categoryMetrics: categoryMetricsDetail,
      },
      mae: Math.round(mae),
      rmse: Math.round(rmse),
      mape: Math.round(mape * 100) / 100,
      directionalAccuracy: null, // Cần previous run để tính
      evaluatedAt: new Date(),
    });

    await this.evalRepo.save(evaluation);
    await this.predictionService.markEvaluated(run.id);
    this.logger.log(`Evaluated forecasting run #${run.id}: MAE=${Math.round(mae)}, MAPE=${Math.round(mape * 100) / 100}%`);
  }

  /**
   * Đánh giá một budgeting run.
   */
  async evaluateBudgetingRun(run: AiPredictionRun): Promise<void> {
    const actualTransactions = await this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .where('t.userId = :userId', { userId: run.userId })
      .andWhere('t.type = :type', { type: 'expense' })
      .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
      .andWhere('t.transaction_date >= :start', { start: run.predictionTargetStart })
      .andWhere('t.transaction_date <= :end', { end: run.predictionTargetEnd })
      .getMany();

    if (actualTransactions.length === 0) {
      await this.predictionService.markSkipped(run.id);
      this.logger.log(`Skipped budgeting run #${run.id}: no actual data`);
      return;
    }

    const actualTotalExpense = actualTransactions.reduce(
      (sum, t) => sum + Number(t.amount || 0),
      0,
    );

    const categoryActual: Record<string, number> = {};
    for (const t of actualTransactions) {
      const catName = t.category?.name || 'Khác';
      categoryActual[catName] = (categoryActual[catName] || 0) + Number(t.amount || 0);
    }

    const payload = run.predictionPayload;
    const recommendedTotal = payload.recommendedTotalBudget || 0;
    const items = payload.items || [];

    let overrunCount = 0;
    let totalOverrunAmount = 0;
    let adoptedCount = 0;
    const categoryDetails: any[] = [];

    for (const item of items) {
      const actual = categoryActual[item.categoryName] || 0;
      const recommended = item.recommendedLimitAmount || 0;
      const overrun = actual > recommended ? actual - recommended : 0;

      if (overrun > 0) {
        overrunCount++;
        totalOverrunAmount += overrun;
      }

      // Heuristic adoption: nếu actual gần recommended (±10%), coi như adopted
      if (recommended > 0 && Math.abs(actual - recommended) / recommended <= 0.1) {
        adoptedCount++;
      }

      categoryDetails.push({
        categoryName: item.categoryName,
        recommendedLimit: recommended,
        predictedSpend: item.predictedSpendAmount || 0,
        actualSpend: actual,
        overrunAmount: overrun,
        wasOverBudget: overrun > 0,
      });
    }

    const overrunRate = items.length > 0 ? overrunCount / items.length : 0;
    const adoptionRate = items.length > 0 ? adoptedCount / items.length : 0;
    const avgOverrunAmount = overrunCount > 0 ? totalOverrunAmount / overrunCount : 0;

    const evaluation = this.evalRepo.create({
      predictionRunId: run.id,
      userId: run.userId,
      actualPayload: {
        actualTotalExpense,
        actualCategoryExpenses: Object.entries(categoryActual).map(([categoryName, amount]) => ({
          categoryName,
          amount,
        })),
      },
      metrics: {
        recommendedTotalBudget: recommendedTotal,
        actualTotalExpense,
        overrunRate: Math.round(overrunRate * 10000) / 100,
        adoptionRate: Math.round(adoptionRate * 10000) / 100,
        averageOverrunAmount: Math.round(avgOverrunAmount),
        categoryDetails,
      },
      mae: null,
      rmse: null,
      mape: null,
      directionalAccuracy: null,
      evaluatedAt: new Date(),
    });

    await this.evalRepo.save(evaluation);
    await this.predictionService.markEvaluated(run.id);
    this.logger.log(`Evaluated budgeting run #${run.id}: overrunRate=${Math.round(overrunRate * 100)}%`);
  }

  /**
   * Lấy summary tổng hợp cho model evaluation API.
   */
  async getModelEvaluationSummary(userId: number): Promise<ModelEvaluationSummaryDto> {
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
  async getForecastingEvaluation(userId: number): Promise<ForecastingEvaluationDetailDto> {
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
        if (cm.absolutePercentageError !== null && cm.absolutePercentageError !== undefined) {
          if (!categoryMap[cm.categoryName]) {
            categoryMap[cm.categoryName] = { totalAPE: 0, count: 0 };
          }
          categoryMap[cm.categoryName].totalAPE += cm.absolutePercentageError;
          categoryMap[cm.categoryName].count += 1;
        }
      }
    }

    const categoryMetrics: CategoryMetricDto[] = Object.entries(categoryMap).map(
      ([categoryName, data]) => ({
        categoryName,
        mape: Math.round((data.totalAPE / data.count) * 100) / 100,
        evaluatedRuns: data.count,
      }),
    );

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
  async getBudgetingEvaluation(userId: number): Promise<BudgetingEvaluationDetailDto> {
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
        (ev.actualPayload?.actualTotalExpense || 0) - (ev.metrics?.recommendedTotalBudget || 0),
      ),
      wasOverBudget: (ev.actualPayload?.actualTotalExpense || 0) > (ev.metrics?.recommendedTotalBudget || 0),
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

  private async buildForecastingSummary(userId: number): Promise<ForecastingSummaryDto | null> {
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

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

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

  private async buildBudgetingSummary(userId: number): Promise<BudgetingSummaryDto | null> {
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

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    return {
      evaluatedRuns: evals.length,
      adoptionRate: avg(adoptionRates) !== null ? Math.round(avg(adoptionRates)! * 100) / 100 : null,
      overrunRate: avg(overrunRates) !== null ? Math.round(avg(overrunRates)! * 100) / 100 : null,
      averageOverrunAmount: avg(overrunAmounts) !== null ? Math.round(avg(overrunAmounts)!) : null,
      lastEvaluatedAt: evals[0].evaluatedAt,
    };
  }
}
