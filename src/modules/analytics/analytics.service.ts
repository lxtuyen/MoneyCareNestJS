import { Injectable, Logger } from '@nestjs/common';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { GoalAchievementPredictionSummaryDto } from '../saving-goals/dto/goal-achievement-prediction.dto';
import {
  formatDateInTimeZone,
  getVietnamMonthRange,
  getVietnamNow,
} from 'src/common/utils/date.util';
import { mapAnalyticsResponse } from './mappers/analytics-response.mapper';
import {
  AnalyticsMappedResponse,
  AnalyticsServiceResponse,
} from './types/analytics-service-response.type';
import { AnalyticsSpendingPlanPayload } from './types/analytics-payload.type';
import { AnalyticsPredictionService } from './analytics-prediction.service';
import { AnalyticsPayloadBuilderService } from './analytics-payload-builder.service';
import { AnalyticsServiceClient } from './analytics-service-client.service';

export interface FinancialSummaryOptions {
  targetMonth?: number;
  targetYear?: number;
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly payloadBuilder: AnalyticsPayloadBuilderService,
    private readonly serviceClient: AnalyticsServiceClient,
    private readonly predictionService: AnalyticsPredictionService,
  ) {}

  async getFinancialSummary(
    userId: number,
    options: FinancialSummaryOptions = {},
  ): Promise<ApiResponse<AnalyticsMappedResponse>> {
    const targetPeriod = this.resolveTargetPeriod(options);

    const {
      requestData,
      spendingPlanPayload,
      transactions,
      savingGoals,
      goalAchievement,
    } = await this.payloadBuilder.buildAnalyzePayload(userId, targetPeriod);

    try {
      const data = await this.serviceClient.analyzeFinancial(requestData);
      const mapped = mapAnalyticsResponse(
        data,
        goalAchievement,
        spendingPlanPayload,
        transactions,
      );

      this.logPredictionRun(userId, mapped, requestData.period, {
        transactionCount: transactions.length,
        hasSpendingPlan: !!spendingPlanPayload,
        activeGoalCount: savingGoals.length,
      });

      return ok(mapped, 'Lấy kết quả phân tích tài chính thành công');
    } catch (error) {
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

      this.logPredictionRun(userId, fallbackData, requestData.period, {
        transactionCount: transactions.length,
        hasSpendingPlan: !!spendingPlanPayload,
        activeGoalCount: savingGoals.length,
      });

      return ok(
        fallbackData,
        'Lấy kết quả phân tích tài chính dự phòng thành công',
      );
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
          .map((pred) => ({
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
      this.logger.warn(`Cannot load AI budgeting snapshot: ${error.message}`);
      return null;
    }
  }

  // ─── Private ───────────────────────────────────────────────────────

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

  private async requestFinancialAnalyze(
    userId: number,
    options: FinancialSummaryOptions = {},
  ): Promise<AnalyticsServiceResponse | null> {
    const targetPeriod = this.resolveTargetPeriod(options);
    const { requestData } = await this.payloadBuilder.buildAnalyzePayload(
      userId,
      targetPeriod,
    );

    return this.serviceClient.analyzeFinancial(requestData);
  }

  private logPredictionRun(
    userId: number,
    mapped: AnalyticsMappedResponse,
    period: string,
    meta: {
      transactionCount: number;
      hasSpendingPlan: boolean;
      activeGoalCount: number;
    },
  ): void {
    this.predictionService
      .logFromAnalyticsResponse(userId, mapped, {
        transactionCount: meta.transactionCount,
        period,
        hasSpendingPlan: meta.hasSpendingPlan,
        activeGoalCount: meta.activeGoalCount,
      })
      .catch((logError) => {
        this.logger.warn(`Cannot log prediction run: ${logError.message}`);
      });
  }

  private generateFallbackData(
    transactions: Transaction[],
    spendingPlan: AnalyticsSpendingPlanPayload | null,
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
      ? spendingPlan.items.map((item) => {
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

    const { start: periodStartDate, end: periodEndDate } = getVietnamMonthRange(
      currentMonth,
      currentYear,
    );

    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const { start: nextPeriodStartDate, end: nextPeriodEndDate } =
      getVietnamMonthRange(nextMonth, nextYear);

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
          periodStart: periodStartDate.toISOString().split('T')[0],
          periodEnd: periodEndDate.toISOString().split('T')[0],
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
          targetMonth: nextMonth,
          targetYear: nextYear,
          periodStart: nextPeriodStartDate.toISOString().split('T')[0],
          periodEnd: nextPeriodEndDate.toISOString().split('T')[0],
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
}
