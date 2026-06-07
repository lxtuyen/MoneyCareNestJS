import { Injectable, Logger } from '@nestjs/common';
import { norm } from 'src/common/utils/string.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { AnalyticsService } from '../analytics/analytics.service';

@Injectable()
export class AiBudgetRecommendationChatService {
  private readonly logger = new Logger(AiBudgetRecommendationChatService.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  isBudgetRecommendationRequest(message: string): boolean {
    const lowerMessage = norm(message || '');
    return (
      lowerMessage.includes('de xuat ngan sach') ||
      lowerMessage.includes('goi y ngan sach') ||
      (lowerMessage.includes('goi y') && lowerMessage.includes('ngan sach')) ||
      (lowerMessage.includes('de xuat') &&
        lowerMessage.includes('ngan sach')) ||
      (lowerMessage.includes('ke hoach') &&
        lowerMessage.includes('ngan sach')) ||
      lowerMessage.includes('cap nhat ngan sach') ||
      lowerMessage.includes('toi nen dat ngan sach') ||
      lowerMessage.includes('giam ngan sach') ||
      lowerMessage.includes('budget recommendation')
    );
  }

  async handleBudgetRecommendation(
    userId: number,
  ): Promise<ApiResponse<string>> {
    this.logger.log(`Handling budget recommendation for user ${userId}`);
    const summaryRes = await this.analyticsService.getFinancialSummary(userId);
    if (!summaryRes.success || !summaryRes.data) {
      return ok(
        '',
        'Tôi gặp lỗi khi lấy dữ liệu phân tích tài chính để đề xuất ngân sách. Vui lòng thử lại sau.',
      );
    }

    const aiBudgeting = summaryRes.data.aiBudgeting;
    if (!aiBudgeting || !aiBudgeting.items || aiBudgeting.items.length === 0) {
      return ok(
        '',
        'Hiện tại hệ thống chưa có đủ dữ liệu chi tiêu hoặc kế hoạch chi tiêu hoạt động để đưa ra đề xuất ngân sách cho bạn.',
      );
    }

    const payload = {
      summary: aiBudgeting.summary,
      planId: aiBudgeting.items.find((item) => item.planId)?.planId || null,
      recommendedTotalBudget: aiBudgeting.recommendedTotalBudget,
      expectedSavingsAmount: aiBudgeting.expectedSavingsAmount,
      confidence: aiBudgeting.confidence,
      items: aiBudgeting.items.map((item) => ({
        recommendationId: item.recommendationId,
        planId: item.planId,
        planItemId: item.planItemId,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        currentLimitAmount: item.currentLimitAmount,
        recommendedLimitAmount: item.recommendedLimitAmount,
        predictedSpendAmount: item.predictedSpendAmount,
        riskBefore: item.riskBefore,
        riskAfter: item.riskAfter,
        confidence: item.confidence,
        elasticity: item.elasticity,
        reasonCodes: item.reasonCodes,
        actionType: item.actionType,
        canApply: item.canApply,
        spentAmount: item.spentAmount,
        adjustmentAmount: item.adjustmentAmount,
        explanation: item.explanation || item.reason,
      })),
    };

    const responseText = `__BUDGET_RECOMMENDATION__${JSON.stringify(payload)}`;
    return ok('', responseText);
  }
}
