import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { SpendingPlan } from '../spending-plans/entities/spending-plan.entity';
import { SpendingPlanStatisticsService } from '../spending-plans/spending-plan-statistics.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PersonalizationService } from '../personalization/personalization.service';
import { AnalyticsPredictionService } from './analytics-prediction.service';
import { AiFeedbackService } from '../ai-feedback/ai-feedback.service';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';
import { GoalAchievementPredictionService } from '../saving-goals/goal-achievement-prediction.service';
import { GoalAchievementPredictionSummaryDto } from '../saving-goals/dto/goal-achievement-prediction.dto';
import {
  formatDateInTimeZone,
  getVietnamNow,
} from 'src/common/utils/date.util';
import { mapAnalyticsResponse } from './mappers/analytics-response.mapper';
import {
  AnalyticsMappedResponse,
  AnalyticsServiceResponse,
} from './types/analytics-service-response.type';

export interface FinancialSummaryOptions {
  targetMonth?: number;
  targetYear?: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(SpendingPlan)
    private readonly planRepo: Repository<SpendingPlan>,

    private readonly planStatsService: SpendingPlanStatisticsService,
    private readonly configService: ConfigService,
    private readonly personalizationService: PersonalizationService,
    private readonly predictionService: AnalyticsPredictionService,
    private readonly aiFeedbackService: AiFeedbackService,
    private readonly evaluationService: AnalyticsEvaluationService,
    @Inject(forwardRef(() => GoalAchievementPredictionService))
    private readonly goalAchievementPredictionService: GoalAchievementPredictionService,
  ) {}

  async getFinancialSummary(
    userId: number,
    options: FinancialSummaryOptions = {},
  ): Promise<ApiResponse<AnalyticsMappedResponse>> {
    const period = 'last_12_months';
    const targetPeriod = this.resolveTargetPeriod(options);
    const targetMonthStart = new Date(
      targetPeriod.year,
      targetPeriod.month - 1,
      1,
    );
    const targetMonthEnd = new Date(targetPeriod.year, targetPeriod.month, 0);
    targetMonthEnd.setHours(23, 59, 59, 999);
    const startDate = new Date(targetMonthStart);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const endDate = targetMonthEnd;

    const transactions = await this.transactionRepo.find({
      where: {
        user: { id: userId },
        transaction_date: Between(startDate, endDate),
      },
      relations: ['category'],
      order: { transaction_date: 'DESC' },
    });

    const savingGoals = await this.goalRepo.find({
      where: {
        user: { id: userId },
        is_completed: false,
      },
      order: { updated_at: 'DESC' },
    });

    const planStatsRes = await this.planStatsService.getActiveStatistics(
      userId,
      targetPeriod.month,
      targetPeriod.year,
    );
    const planStats = planStatsRes.success ? planStatsRes.data : null;

    let spendingPlanPayload: any = null;
    if (planStats && planStats.planId) {
      const activePlan = await this.planRepo.findOne({
        where: { id: planStats.planId },
        relations: ['estimatedExpenses', 'estimatedExpenses.category'],
      });

      if (activePlan) {
        spendingPlanPayload = {
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
    }

    const [profileSummary, feedbackSummary, modelEvaluation] =
      await Promise.all([
        this.personalizationService.getProfileSummary(userId),
        this.aiFeedbackService.getSummary(userId, undefined, 'last_180_days'),
        this.buildModelEvaluationPayload(userId),
      ]);
    const goalAchievement = await this.buildGoalAchievementPayload(userId);
    const essentialCategories = Array.isArray(
      profileSummary.essentialCategories,
    )
      ? profileSummary.essentialCategories
          .map((item: any) => item?.name || item?.categoryName || item)
          .filter(Boolean)
      : [];

    const requestData = {
      user_id: userId,
      transactions: transactions.map((t) => ({
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
      })),
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
        `FastAPI analytics request timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    try {
      this.logger.log(`Calling FastAPI at: ${url}/v1/financial/analyze`);
      const response = await fetch(`${url}/v1/financial/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as AnalyticsServiceResponse;
      const mapped = mapAnalyticsResponse(
        data,
        goalAchievement,
        spendingPlanPayload,
        transactions,
      );

      // Log prediction run (không ảnh hưởng response nếu lỗi)
      try {
        await this.predictionService.logFromAnalyticsResponse(userId, mapped, {
          transactionCount: transactions.length,
          period,
          hasSpendingPlan: !!spendingPlanPayload,
          activeGoalCount: savingGoals.length,
        });
      } catch (logError) {
        this.logger.warn(`Cannot log prediction run: ${logError.message}`);
      }

      return ok(mapped, 'Lấy kết quả phân tích tài chính thành công');
    } catch (error) {
      clearTimeout(timeoutId);
      this.logger.error(
        `Error calling FastAPI: ${error.message}. Returning fallback data.`,
      );

      const fallbackData = this.generateFallbackData(
        transactions,
        spendingPlanPayload,
        savingGoals,
        goalAchievement,
        targetPeriod,
      );

      // Log fallback prediction run
      try {
        await this.predictionService.logFromAnalyticsResponse(
          userId,
          fallbackData,
          {
            transactionCount: transactions.length,
            period,
            hasSpendingPlan: !!spendingPlanPayload,
            activeGoalCount: savingGoals.length,
          },
        );
      } catch (logError) {
        this.logger.warn(
          `Cannot log fallback prediction run: ${logError.message}`,
        );
      }

      return ok(
        fallbackData,
        'Lấy kết quả phân tích tài chính dự phòng thành công',
      );
    }
  }

  private resolveTargetPeriod(options: FinancialSummaryOptions): {
    month: number;
    year: number;
  } {
    const now = getVietnamNow();
    const month = Number(options.targetMonth);
    const year = Number(options.targetYear);

    return {
      month:
        Number.isInteger(month) && month >= 1 && month <= 12
          ? month
          : now.getMonth() + 1,
      year:
        Number.isInteger(year) && year >= 2000 && year <= 2100
          ? year
          : now.getFullYear(),
    };
  }

  private generateFallbackData(
    transactions: Transaction[],
    spendingPlan: any,
    savingGoals: SavingGoal[],
    goalAchievement: GoalAchievementPredictionSummaryDto | null,
    targetPeriod: { month: number; year: number },
  ): AnalyticsMappedResponse {
    const currentMonth = targetPeriod.month;
    const currentYear = targetPeriod.year;

    const incomes = transactions.filter(
      (t) => t.type === 'income' && !t.isTransfer,
    );
    const expenses = transactions.filter(
      (t) => t.type === 'expense' && !t.isTransfer,
    );
    const isCurrentMonthTransaction = (t: Transaction) => {
      const dateKey = formatDateInTimeZone(t.transaction_date);
      return dateKey.startsWith(
        `${currentYear}-${currentMonth.toString().padStart(2, '0')}-`,
      );
    };
    const currentMonthExpenses = expenses.filter(isCurrentMonthTransaction);

    const totalIncome = incomes.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
    const netBalance = totalIncome - totalExpense;
    const currentMonthExpense = currentMonthExpenses.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );

    let score = 70;
    if (totalExpense > totalIncome) score = 40;
    else if (totalIncome > 0 && netBalance / totalIncome > 0.2) score = 85;

    const budgetItems = spendingPlan
      ? spendingPlan.items.map((item: any) => {
          const ratio =
            item.limit_amount > 0 ? item.spent_amount / item.limit_amount : 0;
          return {
            categoryName: item.category_name,
            limitAmount: item.limit_amount,
            spentAmount: item.spent_amount,
            riskScore: Math.min(100, ratio * 100),
            status:
              ratio >= 1.0 ? 'danger' : ratio >= 0.85 ? 'warning' : 'normal',
          };
        })
      : [];

    const completedMonthTotals = new Map<string, number>();
    for (const expense of expenses) {
      const dateKey = formatDateInTimeZone(expense.transaction_date);
      const [yearText, monthText] = dateKey.split('-');
      const year = Number(yearText);
      const month = Number(monthText);
      const isCompletedMonth =
        year < currentYear || (year === currentYear && month < currentMonth);
      if (!isCompletedMonth) continue;

      const monthKey = `${yearText}-${monthText}`;
      completedMonthTotals.set(
        monthKey,
        (completedMonthTotals.get(monthKey) ?? 0) + Number(expense.amount),
      );
    }
    const completedMonthValues = Array.from(completedMonthTotals.values());
    const fallbackTotalForecast =
      completedMonthValues.length > 0
        ? completedMonthValues.reduce((sum, amount) => sum + amount, 0) /
          completedMonthValues.length
        : currentMonthExpense;
    const predictedRemainingForecast = Math.max(
      0,
      fallbackTotalForecast - currentMonthExpense,
    );
    const savingProjections = savingGoals.map((g) => {
      const remaining = Math.max(0, Number(g.target) - Number(g.saved_amount));
      const monthlyRate = netBalance > 0 ? netBalance / 12 : 500000;
      const monthsRemaining = remaining / monthlyRate;

      return {
        goalId: g.id,
        name: g.name,
        monthsRemaining: Math.round(monthsRemaining * 10) / 10,
        monthsDiff: 0.0,
        isOnTrack: true,
        statusText: 'Đúng tiến độ (dự phòng)',
      };
    });

    return {
      financialHealthScore: score,
      cashFlowTrend: netBalance >= 0 ? 'stable' : 'worsening',
      monthlyForecast: fallbackTotalForecast,
      anomalies: [],
      budgetRisk: {
        riskLevel: budgetItems.some((item) => item.status === 'danger')
          ? 'high'
          : 'low',
        message: 'Ngân sách chi tiêu được tính toán dự phòng.',
        items: budgetItems,
      },
      savingGoalProjections: savingProjections,
      insights: [
        {
          title: 'Dữ liệu thống kê cơ bản',
          message:
            'Dịch vụ phân tích nâng cao hiện tại đang bảo trì. MoneyCare đang hiển thị các chỉ số cơ bản của bạn.',
          severity: 'info',
          evidence: `Tổng thu: ${totalIncome.toLocaleString(
            'vi-VN',
          )} VND | Tổng chi: ${totalExpense.toLocaleString('vi-VN')} VND`,
        },
      ],
      forecasting: {
        currentMonthProjection: {
          method: 'fallback_average',
          modelVersion: 'v2',
          periodType: 'month',
          forecastMode: 'current_month_projection',
          targetMonth: currentMonth,
          targetYear: currentYear,
          periodStart: new Date(currentYear, currentMonth - 1, 1)
            .toISOString()
            .split('T')[0],
          periodEnd: new Date(currentYear, currentMonth, 0)
            .toISOString()
            .split('T')[0],
          actualAmount: currentMonthExpense,
          predictedRemainingAmount: predictedRemainingForecast,
          totalForecast: currentMonthExpense + predictedRemainingForecast,
          confidence: 0.35,
          riskLevel: 'low',
          modelNotes: 'Dự báo dự phòng từ dữ liệu thống kê cơ bản.',
          weeklyForecasts: [],
          categoryForecasts: [],
          riskWindows: [],
          dailyPoints: [],
        },
        nextMonthForecast: {
          method: 'fallback_average',
          modelVersion: 'v2',
          periodType: 'month',
          forecastMode: 'next_month_forecast',
          targetMonth: currentMonth === 12 ? 1 : currentMonth + 1,
          targetYear: currentMonth === 12 ? currentYear + 1 : currentYear,
          periodStart: new Date(
            currentMonth === 12 ? currentYear + 1 : currentYear,
            currentMonth === 12 ? 0 : currentMonth,
            1,
          )
            .toISOString()
            .split('T')[0],
          periodEnd: new Date(
            currentMonth === 12 ? currentYear + 1 : currentYear,
            currentMonth === 12 ? 1 : currentMonth + 1,
            0,
          )
            .toISOString()
            .split('T')[0],
          actualAmount: 0,
          predictedRemainingAmount: fallbackTotalForecast,
          totalForecast: fallbackTotalForecast,
          confidence: 0.3,
          riskLevel: 'low',
          modelNotes: 'Dự báo dự phòng từ dữ liệu thống kê cơ bản.',
          weeklyForecasts: [],
          categoryForecasts: [],
          riskWindows: [],
          dailyPoints: [],
        },
      },
      aiBudgeting: {
        method: 'fallback_budgeting',
        modelVersion: 'v1',
        targetSavingsAmount: Math.max(0, totalIncome * 0.15),
        recommendedTotalBudget: Math.max(0, totalIncome - totalIncome * 0.15),
        expectedSavingsAmount: Math.max(0, netBalance),
        confidence: 0.35,
        strategy: 'stability_first',
        items: [],
        budgetExceedPredictions: [],
        summary:
          'Chưa có kết quả AI Budgeting nâng cao, hệ thống tạm dùng dữ liệu dự phòng.',
      },
      goalAchievement,
    };
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

  private async buildModelEvaluationPayload(userId: number) {
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

  async fetchAiBudgetingSnapshot(userId: number): Promise<{
    budgetExceedPredictions: Array<{
      categoryName: string;
      totalForecast: number;
    }>;
    expectedSavingsAmount: number;
  } | null> {
    try {
      const data = await this.requestFinancialAnalyze(userId);
      if (!data?.ai_budgeting) {
        return null;
      }

      const rawPredictions =
        data.ai_budgeting.budget_exceed_predictions ||
        data.ai_budgeting.budgetExceedPredictions ||
        [];

      return {
        budgetExceedPredictions: rawPredictions
          .map((pred: any) => ({
            categoryName: String(
              pred.category_name || pred.categoryName || '',
            ).trim(),
            totalForecast: Number(
              pred.total_forecast ?? pred.totalForecast ?? 0,
            ),
          }))
          .filter((pred) => pred.categoryName.length > 0),
        expectedSavingsAmount: Number(
          data.ai_budgeting.expected_savings_amount ?? 0,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Cannot load AI budgeting snapshot: ${error.message}`,
      );
      return null;
    }
  }

  private async requestFinancialAnalyze(
    userId: number,
    options: FinancialSummaryOptions = {},
  ): Promise<AnalyticsServiceResponse | null> {
    const period = 'last_12_months';
    const targetPeriod = this.resolveTargetPeriod(options);
    const targetMonthStart = new Date(
      targetPeriod.year,
      targetPeriod.month - 1,
      1,
    );
    const targetMonthEnd = new Date(targetPeriod.year, targetPeriod.month, 0);
    targetMonthEnd.setHours(23, 59, 59, 999);
    const startDate = new Date(targetMonthStart);
    startDate.setFullYear(startDate.getFullYear() - 1);
    const endDate = targetMonthEnd;

    const transactions = await this.transactionRepo.find({
      where: {
        user: { id: userId },
        transaction_date: Between(startDate, endDate),
      },
      relations: ['category'],
      order: { transaction_date: 'DESC' },
    });

    const savingGoals = await this.goalRepo.find({
      where: {
        user: { id: userId },
        is_completed: false,
      },
      order: { updated_at: 'DESC' },
    });

    const planStatsRes = await this.planStatsService.getActiveStatistics(
      userId,
      targetPeriod.month,
      targetPeriod.year,
    );
    const planStats = planStatsRes.success ? planStatsRes.data : null;

    let spendingPlanPayload: any = null;
    if (planStats && planStats.planId) {
      const activePlan = await this.planRepo.findOne({
        where: { id: planStats.planId },
        relations: ['estimatedExpenses', 'estimatedExpenses.category'],
      });

      if (activePlan) {
        spendingPlanPayload = {
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
    }

    const [profileSummary, feedbackSummary, modelEvaluation] =
      await Promise.all([
        this.personalizationService.getProfileSummary(userId),
        this.aiFeedbackService.getSummary(userId, undefined, 'last_180_days'),
        this.buildModelEvaluationPayload(userId),
      ]);

    const essentialCategories = Array.isArray(
      profileSummary.essentialCategories,
    )
      ? profileSummary.essentialCategories
          .map((item: any) => item?.name || item?.categoryName || item)
          .filter(Boolean)
      : [];

    const requestData = {
      user_id: userId,
      transactions: transactions.map((t) => ({
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
      })),
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
        `FastAPI analytics request timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    try {
      const response = await fetch(`${url}/v1/financial/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(requestData),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return (await response.json()) as AnalyticsServiceResponse;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async buildGoalAchievementPayload(userId: number) {
    try {
      return await this.goalAchievementPredictionService.predictAllGoals(
        userId,
      );
    } catch (error) {
      this.logger.warn(
        `Cannot load goal achievement predictions: ${error.message}`,
      );
      return null;
    }
  }
}
