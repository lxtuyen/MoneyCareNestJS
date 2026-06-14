import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { SpendingPlan } from '../spending-plans/entities/spending-plan.entity';
import { SpendingPlanStatisticsService } from '../spending-plans/spending-plan-statistics.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PersonalizationService } from '../personalization/personalization.service';
import { AiFeedbackService } from '../ai-feedback/ai-feedback.service';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';
import { GoalAchievementPredictionService } from '../saving-goals/goal-achievement-prediction.service';
import { GoalAchievementPredictionSummaryDto } from '../saving-goals/dto/goal-achievement-prediction.dto';
import { getVietnamMonthRange } from 'src/common/utils/date.util';
import {
  AnalyticsAnalyzeRequestPayload,
  AnalyticsSpendingPlanPayload,
  AnalyticsTransactionPayload,
} from './types/analytics-payload.type';

export interface AnalyzePayloadResult {
  requestData: AnalyticsAnalyzeRequestPayload;
  spendingPlanPayload: AnalyticsSpendingPlanPayload | null;
  transactions: Transaction[];
  savingGoals: SavingGoal[];
  goalAchievement: GoalAchievementPredictionSummaryDto | null;
}

@Injectable()
export class AnalyticsPayloadBuilderService {
  private readonly logger = new Logger(AnalyticsPayloadBuilderService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(SpendingPlan)
    private readonly planRepo: Repository<SpendingPlan>,

    private readonly planStatsService: SpendingPlanStatisticsService,
    private readonly personalizationService: PersonalizationService,
    private readonly aiFeedbackService: AiFeedbackService,
    private readonly evaluationService: AnalyticsEvaluationService,
    @Inject(forwardRef(() => GoalAchievementPredictionService))
    private readonly goalAchievementPredictionService: GoalAchievementPredictionService,
  ) {}

  /**
   * Consolidates the duplicated data-fetching logic from
   * `getFinancialSummary()` and `requestFinancialAnalyze()`.
   */
  async buildAnalyzePayload(
    userId: number,
    targetPeriod: { month: number; year: number },
  ): Promise<AnalyzePayloadResult> {
    const period = 'last_12_months';

    // --- Date boundaries (Vietnam timezone-aware) ---
    const { start: targetMonthStart, end: targetMonthEnd } =
      getVietnamMonthRange(targetPeriod.month, targetPeriod.year);

    const startDate = new Date(targetMonthStart);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const endDate = targetMonthEnd;

    // --- Parallel: transactions + saving goals ---
    const [transactions, savingGoals] = await Promise.all([
      this.transactionRepo.find({
        where: {
          user: { id: userId },
          transaction_date: Between(startDate, endDate),
        },
        relations: ['category'],
        order: { transaction_date: 'DESC' },
      }),
      this.goalRepo.find({
        where: {
          user: { id: userId },
          is_completed: false,
        },
        order: { updated_at: 'DESC' },
      }),
    ]);

    // --- Spending plan payload ---
    const spendingPlanPayload = await this.buildSpendingPlanPayload(
      userId,
      targetPeriod,
    );

    // --- Profile, feedback, model evaluation (parallel) ---
    const [profileSummary, feedbackSummary, modelEvaluation] =
      await Promise.all([
        this.personalizationService.getProfileSummary(userId),
        this.aiFeedbackService.getSummary(userId, undefined, 'last_180_days'),
        this.buildModelEvaluationPayload(userId),
      ]);

    // --- Goal achievement ---
    const goalAchievement = await this.buildGoalAchievementPayload(userId);

    // --- Essential categories ---
    const essentialCategories = Array.isArray(
      profileSummary.essentialCategories,
    )
      ? profileSummary.essentialCategories
          .map((item: any) => item?.name || item?.categoryName || item)
          .filter(Boolean)
      : [];

    // --- Map transactions to payload ---
    const transactionPayloads: AnalyticsTransactionPayload[] = transactions.map(
      (t) => ({
        id: t.id,
        amount: Number(t.amount),
        transaction_date: t.transaction_date,
        type: t.type,
        category: t.category
          ? {
              id: t.category.id,
              name: t.category.name,
              icon: t.category.icon,
              type: t.category.type,
            }
          : { name: 'Khác' },
        note: t.note || '',
        is_transfer: t.isTransfer || false,
      }),
    );

    // --- Build request payload ---
    const requestData: AnalyticsAnalyzeRequestPayload = {
      user_id: userId,
      transactions: transactionPayloads,
      spending_plan: spendingPlanPayload,
      saving_goals: savingGoals.map((g) => ({
        id: g.id,
        name: g.name,
        target: Number(g.target),
        saved_amount: Number(g.saved_amount),
        months: this.calculateMonths(g.start_date, g.end_date),
        is_completed: g.is_completed,
      })),
      period,
      personal_profile: {
        spending_style: profileSummary.spendingStyle,
        risk_level: profileSummary.riskLevel,
        average_monthly_income: profileSummary.averageMonthlyIncome,
        savings_rate: profileSummary.savingsRate,
        budget_discipline_score: profileSummary.budgetDisciplineScore,
        expense_volatility_score: profileSummary.expenseVolatilityScore,
        preferred_budget_buffer_pct: profileSummary.preferredBudgetBufferPct,
        confidence_score: profileSummary.confidenceScore,
      },
      feedback_summary: feedbackSummary,
      model_evaluation: modelEvaluation,
      essential_categories: essentialCategories,
      target_month: targetPeriod.month,
      target_year: targetPeriod.year,
    };

    return {
      requestData,
      spendingPlanPayload,
      transactions,
      savingGoals,
      goalAchievement,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────

  private async buildSpendingPlanPayload(
    userId: number,
    targetPeriod: { month: number; year: number },
  ): Promise<AnalyticsSpendingPlanPayload | null> {
    const planStatsRes = await this.planStatsService.getActiveStatistics(
      userId,
      targetPeriod.month,
      targetPeriod.year,
    );
    const planStats = planStatsRes.success ? planStatsRes.data : null;

    if (!planStats?.planId) {
      return null;
    }

    const activePlan = await this.planRepo.findOne({
      where: { id: planStats.planId },
      relations: ['estimatedExpenses', 'estimatedExpenses.category'],
    });

    if (!activePlan) {
      return null;
    }

    return {
      id: activePlan.id,
      month: targetPeriod.month,
      year: targetPeriod.year,
      planned_budget: Number(activePlan.totalAmount || 0),
      planned_income: Number(activePlan.totalAmount || 0),
      items: (planStats.fixedExpenses || []).map((item: any) => ({
        id: item.id,
        category_id: item.category?.id || 0,
        category_name: item.category?.name || 'Khác',
        limit_amount: Number(item.monthlyLimit || 0),
        spent_amount: Number(item.spentThisMonth || 0),
      })),
    };
  }

  private async buildModelEvaluationPayload(userId: number): Promise<{
    overall_mape: number | null;
    evaluated_runs: number;
    category_mape: Record<string, number>;
  }> {
    try {
      const [summary, forecastingDetail] = await Promise.all([
        this.evaluationService.getModelEvaluationSummary(userId),
        this.evaluationService.getForecastingEvaluation(userId),
      ]);

      const categoryMape = (forecastingDetail.categoryMetrics || []).reduce(
        (acc, item) => {
          acc[item.categoryName] = item.mape;
          acc[item.categoryName.toLowerCase()] = item.mape;
          return acc;
        },
        {} as Record<string, number>,
      );

      return {
        overall_mape: summary.forecasting?.mape ?? null,
        evaluated_runs: summary.forecasting?.evaluatedRuns ?? 0,
        category_mape: categoryMape,
      };
    } catch (error) {
      this.logger.warn(
        `Cannot load model evaluation summary: ${error.message}`,
      );
      return {
        overall_mape: null,
        evaluated_runs: 0,
        category_mape: {},
      };
    }
  }

  private async buildGoalAchievementPayload(
    userId: number,
  ): Promise<GoalAchievementPredictionSummaryDto | null> {
    try {
      return await this.goalAchievementPredictionService.predictAllGoals(
        userId,
        true, // skipAiSnapshot
      );
    } catch (error) {
      this.logger.warn(
        `Cannot load goal achievement predictions: ${error.message}`,
      );
      return null;
    }
  }

  private calculateMonths(start: Date | null, end: Date | null): number {
    if (!start || !end) return 6;
    const s = new Date(start);
    const e = new Date(end);
    const diffYears = e.getFullYear() - s.getFullYear();
    const diffMonths = e.getMonth() - s.getMonth();
    const totalMonths = diffYears * 12 + diffMonths;
    return totalMonths > 0 ? totalMonths : 1;
  }
}
