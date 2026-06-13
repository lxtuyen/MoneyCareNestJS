import { Injectable, Logger } from '@nestjs/common';
import { norm } from 'src/common/utils/string.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  filterGoalBudgetRecommendations,
  resolvePrimaryGoalPrediction,
} from './helpers/saving-goal-analytics-context.helper';

@Injectable()
export class AiGoalAchievementChatService {
  private readonly logger = new Logger(AiGoalAchievementChatService.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  isGoalAchievementRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const hasGoalContext =
      normalized.includes('muc tieu') ||
      normalized.includes('tiet kiem') ||
      normalized.includes('saving goal');

    if (!hasGoalContext) return false;

    const hasCreateIntent =
      normalized.includes('muon tiet kiem') ||
      normalized.includes('muon mua') ||
      normalized.includes('toi muon') ||
      normalized.includes('de danh') ||
      normalized.includes('gom tien') ||
      normalized.includes('gop tien') ||
      normalized.includes('len muc tieu');

    const hasProgressIntent =
      normalized.includes('co kip han') ||
      normalized.includes('co kip') ||
      normalized.includes('tien do') ||
      normalized.includes('du bao') ||
      normalized.includes('co on khong') ||
      normalized.includes('the nao') ||
      normalized.includes('lam sao') ||
      normalized.includes('giup toi') ||
      normalized.includes('tang toc') ||
      normalized.includes('cat giam') ||
      normalized.includes('dieu chinh ngan sach') ||
      normalized.includes('dieu chinh ke hoach') ||
      normalized.includes('dat muc tieu') ||
      normalized.includes('kha nang hoan thanh') ||
      normalized.includes('tre han') ||
      normalized.includes('on khong') ||
      normalized.includes('goal progress') ||
      normalized.includes('goal achievement');

    if (hasCreateIntent && !hasProgressIntent) return false;

    return hasProgressIntent;
  }

  async handleGoalAchievementInsight(
    userId: number,
  ): Promise<ApiResponse<string>> {
    this.logger.log(`Handling goal achievement insight for user ${userId}`);
    const summaryRes = await this.analyticsService.getFinancialSummary(userId);
    if (!summaryRes.success || !summaryRes.data) {
      return ok(
        '',
        'Tôi gặp lỗi khi lấy dữ liệu phân tích tài chính để đánh giá mục tiêu. Vui lòng thử lại sau.',
      );
    }

    const analytics = summaryRes.data;
    const prediction = resolvePrimaryGoalPrediction(
      analytics.goalAchievement ?? null,
    );

    if (!prediction) {
      return ok(
        '',
        'Bạn chưa có mục tiêu tiết kiệm nào đang hoạt động. Hãy thử nói: "Tôi muốn tiết kiệm 5 triệu đi du lịch" để tôi giúp bạn lên mục tiêu nhé!',
      );
    }

    const budgetRecommendations = filterGoalBudgetRecommendations(
      analytics.aiBudgeting,
    );
    const planId =
      analytics.aiBudgeting?.items?.find((item) => item.planId)?.planId ?? null;

    const summary = this.buildSummary(prediction);
    const payload = {
      summary,
      goalId: prediction.goalId,
      planId,
      canApplyBudget: budgetRecommendations.some((item) => item.canApply),
      confidence: prediction.confidence,
      prediction: {
        goalId: prediction.goalId,
        name: prediction.name,
        targetAmount: prediction.targetAmount,
        savedAmount: prediction.savedAmount,
        remainingAmount: prediction.remainingAmount,
        deadline: prediction.deadline,
        predictedCompletionDate: prediction.predictedCompletionDate,
        daysRemainingToDeadline: prediction.daysRemainingToDeadline,
        predictedDaysToComplete: prediction.predictedDaysToComplete,
        daysDifference: prediction.daysDifference,
        status: prediction.status,
        riskLevel: prediction.riskLevel,
        progressPct: prediction.progressPct,
        currentMonthlySavingRate: prediction.currentMonthlySavingRate,
        projectedMonthlySavingRate: prediction.projectedMonthlySavingRate,
        requiredMonthlySavingRate: prediction.requiredMonthlySavingRate,
        requiredWeeklySavingRate: prediction.requiredWeeklySavingRate,
        requiredDailySavingRate: prediction.requiredDailySavingRate,
        shortfallAmount: prediction.shortfallAmount,
        surplusAmount: prediction.surplusAmount,
        confidence: prediction.confidence,
        reasonCodes: prediction.reasonCodes,
        recommendedActions: prediction.recommendedActions,
        supportingData: prediction.supportingData,
      },
      budgetRecommendations,
      expectedSavingsAmount: analytics.aiBudgeting?.expectedSavingsAmount ?? 0,
      recommendedTotalBudget:
        analytics.aiBudgeting?.recommendedTotalBudget ?? 0,
    };

    const responseText = `__GOAL_ACHIEVEMENT_INSIGHT__${JSON.stringify(payload)}`;
    return ok('', responseText);
  }

  private buildSummary(prediction: {
    name: string;
    status: string;
    daysDifference: number | null;
    shortfallAmount: number;
  }): string {
    if (prediction.status === 'completed') {
      return `Mục tiêu "${prediction.name}" đã hoàn thành.`;
    }
    if (prediction.status === 'unlikely') {
      return `Mục tiêu "${prediction.name}" hiện khó đạt với tốc độ tiết kiệm hiện tại.`;
    }

    const days = prediction.daysDifference;
    if (days != null && days > 0) {
      return `Mục tiêu "${prediction.name}" dự kiến trễ ${days} ngày. Cần tăng tiết kiệm thêm khoảng ${Math.round(prediction.shortfallAmount).toLocaleString('vi-VN')} VND/tháng.`;
    }
    if (days != null && days < 0) {
      return `Mục tiêu "${prediction.name}" đang đi trước kế hoạch ${Math.abs(days)} ngày.`;
    }
    return `Mục tiêu "${prediction.name}" đang đi đúng tiến độ.`;
  }
}
