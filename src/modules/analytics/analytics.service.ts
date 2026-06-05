import { Injectable, Logger } from '@nestjs/common';
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
  ) {}

  async getFinancialSummary(userId: number): Promise<ApiResponse<any>> {
    const period = 'last_12_months';
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const transactions = await this.transactionRepo.find({
      where: {
        user: { id: userId },
        transaction_date: Between(startDate, new Date()),
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

    const planStatsRes =
      await this.planStatsService.getActiveStatistics(userId);
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
          month: new Date().getMonth() + 1,
          year: new Date().getFullYear(),
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

      const data = await response.json();
      const mapped = this.mapAnalyticsResponse(data);

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

  private mapAnalyticsResponse(data: any) {
    return {
      financialHealthScore: data.financial_health_score,
      cashFlowTrend: data.cash_flow_trend,
      monthlyForecast: data.monthly_forecast,
      anomalies: (data.anomalies || []).map((a: any) => ({
        transactionId: a.transaction_id,
        amount: a.amount,
        date: a.date,
        categoryName: a.category_name,
        reason: a.reason,
      })),
      budgetRisk: {
        riskLevel: data.budget_risk.risk_level,
        message: data.budget_risk.message,
        items: (data.budget_risk.items || []).map((i: any) => ({
          categoryName: i.category_name,
          limitAmount: i.limit_amount,
          spentAmount: i.spent_amount,
          riskScore: i.risk_score,
          status: i.status,
        })),
      },
      savingGoalProjections: (data.saving_goal_projections || []).map(
        (sp: any) => ({
          goalId: sp.goal_id,
          name: sp.name,
          monthsRemaining: sp.months_remaining,
          monthsDiff: sp.months_diff,
          isOnTrack: sp.is_on_track,
          statusText: sp.status_text,
        }),
      ),
      insights: (data.insights || []).map((ins: any) => ({
        title: ins.title,
        message: ins.message,
        severity: ins.severity,
        evidence: ins.evidence,
      })),
      forecasting: data.forecasting
        ? {
            method: data.forecasting.method,
            horizonDays: data.forecasting.horizon_days,
            totalForecast: data.forecasting.total_forecast,
            confidence: data.forecasting.confidence,
            dailyPoints: (data.forecasting.daily_points || []).map(
              (p: any) => ({
                date: p.date,
                predictedAmount: p.predicted_amount,
              }),
            ),
            categoryForecasts: (data.forecasting.category_forecasts || []).map(
              (c: any) => ({
                categoryName: c.category_name,
                predictedAmount: c.predicted_amount,
                confidence: c.confidence,
                trend: c.trend,
                dataPoints: c.data_points,
              }),
            ),
            modelNotes: data.forecasting.model_notes,
          }
        : null,
      aiBudgeting: data.ai_budgeting
        ? {
            method: data.ai_budgeting.method,
            modelVersion: data.ai_budgeting.model_version,
            targetSavingsAmount: data.ai_budgeting.target_savings_amount,
            recommendedTotalBudget: data.ai_budgeting.recommended_total_budget,
            expectedSavingsAmount: data.ai_budgeting.expected_savings_amount,
            confidence: data.ai_budgeting.confidence,
            strategy: data.ai_budgeting.strategy,
            items: (data.ai_budgeting.items || []).map((item: any) => ({
              recommendationId: item.recommendation_id,
              categoryName: item.category_name,
              currentLimitAmount: item.current_limit_amount,
              spentAmount: item.spent_amount,
              recommendedLimitAmount: item.recommended_limit_amount,
              predictedSpendAmount: item.predicted_spend_amount,
              adjustmentAmount: item.adjustment_amount,
              actionType: item.action_type,
              riskBefore: item.risk_before,
              riskAfter: item.risk_after,
              riskLevel: item.risk_level,
              confidence: item.confidence,
              elasticity: item.elasticity,
              reasonCodes: item.reason_codes || [],
              explanation: item.explanation,
              personalizationFactors: item.personalization_factors || {},
              expectedImpact: item.expected_impact || {},
              reason: item.reason,
            })),
            summary: data.ai_budgeting.summary,
          }
        : null,
    };
  }

  private generateFallbackData(
    transactions: Transaction[],
    spendingPlan: any,
    savingGoals: SavingGoal[],
  ) {
    const incomes = transactions.filter(
      (t) => t.type === 'income' && !t.isTransfer,
    );
    const expenses = transactions.filter(
      (t) => t.type === 'expense' && !t.isTransfer,
    );

    const totalIncome = incomes.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
    const netBalance = totalIncome - totalExpense;

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

    const monthlyForecast = totalExpense > 0 ? totalExpense / 12 : 0;
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
      monthlyForecast,
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
        method: 'fallback_average',
        horizonDays: 30,
        totalForecast: monthlyForecast,
        confidence: 0.35,
        dailyPoints: [],
        categoryForecasts: [],
        modelNotes: 'Dự báo dự phòng từ dữ liệu thống kê cơ bản.',
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
        summary:
          'Chưa có kết quả AI Budgeting nâng cao, hệ thống tạm dùng dữ liệu dự phòng.',
      },
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
}
