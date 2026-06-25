import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { SavingGoalsStatisticsService } from 'src/modules/saving-goals/saving-goals-statistics.service';
import { SavingGoalStatus } from 'src/modules/saving-goals/enums/saving-goal-status.enum';
import { PersonalizationService } from 'src/modules/personalization/personalization.service';
import { norm } from 'src/common/utils/string.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { AnalyticsService } from '../analytics/analytics.service';
import { HabitCommitmentsService } from '../habit-commitments/habit-commitments.service';
import {
  filterGoalBudgetRecommendations,
  resolvePrimaryGoalPrediction,
} from './helpers/saving-goal-analytics-context.helper';

@Injectable()
export class AiGoalAchievementChatService {
  private readonly logger = new Logger(AiGoalAchievementChatService.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,
    private readonly savingGoalsStatisticsService: SavingGoalsStatisticsService,
    private readonly personalizationService: PersonalizationService,
    private readonly habitCommitmentsService: HabitCommitmentsService,
  ) {}

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
    message?: string,
    goalId?: number,
    forecastedSaving?: number,
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
    let prediction = resolvePrimaryGoalPrediction(
      analytics.goalAchievement ?? null,
    );

    // Ưu tiên lookup bằng goalId nếu có, fallback NLP matching
    if (goalId && goalId > 0 && analytics.goalAchievement?.predictions?.length) {
      const matchById = analytics.goalAchievement.predictions.find(
        (p) => p.goalId === goalId,
      );
      if (matchById) {
        prediction = matchById;
      }
    } else if (message && analytics.goalAchievement?.predictions?.length) {
      const sortedPredictions = [...analytics.goalAchievement.predictions].sort(
        (a, b) => b.name.length - a.name.length,
      );
      const match = sortedPredictions.find((p) =>
        message.toLowerCase().includes(p.name.toLowerCase()),
      );
      if (match) {
        prediction = match;
      }
    }

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

    let milestones: any[] = [];
    let goalEndDate: string | null = null;
    let reportTransactions: any[] = [];

    if (prediction.goalId) {
      try {
        const goal = await this.goalRepo.findOne({
          where: { id: prediction.goalId, user: { id: userId } },
          relations: ['wallet', 'user'],
        });
        if (goal) {
          goalEndDate = goal.end_date ? goal.end_date.toISOString() : null;
          const dbMilestones =
            await this.savingGoalsStatisticsService.getMilestonesForGoal(goal);
          milestones = dbMilestones.map((m) => ({
            label: m.label,
            start_date: m.start_date.toISOString(),
            end_date: m.end_date.toISOString(),
            target: m.target,
            actual: m.actual,
            is_completed: m.is_completed,
          }));
        }

        const reportRes = await this.savingGoalsStatisticsService.getGoalReport(
          prediction.goalId,
          userId,
        );
        if (reportRes.success && (reportRes.data as any)?.transactions) {
          reportTransactions = (reportRes.data as any).transactions
            .filter((t: any) => t.type === 'income')
            .map((t: any) => ({
              id: t.id,
              amount: Number(t.amount),
              type: t.type,
              note: t.note || 'Nạp tiền tiết kiệm',
              transactionDate: t.transaction_date,
            }));
        }
      } catch (err) {
        this.logger.error(`Error loading milestones or report: ${err.message}`);
      }
    }

    let otherGoalsRequiredMonthlyRate = 0;
    try {
      const activeGoals = await this.goalRepo.find({
        where: { user: { id: userId }, status: SavingGoalStatus.ACTIVE },
      });
      for (const ag of activeGoals) {
        if (ag.id === prediction.goalId) continue;
        const target = Number(ag.target ?? 0);
        if (target <= 0 || !ag.start_date || !ag.end_date) continue;
        // Đếm số milestone (segments tháng) giống logic calculateMilestones
        const start = new Date(ag.start_date);
        const end = new Date(ag.end_date);
        const milestoneDates: Date[] = [start];
        let next = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        const endStartOfDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        while (next < endStartOfDay) {
          milestoneDates.push(new Date(next));
          next = new Date(next.getFullYear(), next.getMonth() + 1, 1);
        }
        milestoneDates.push(end);
        const totalSegments = Math.max(1, milestoneDates.length - 1);
        otherGoalsRequiredMonthlyRate += target / totalSegments;
      }
    } catch (err) {
      this.logger.error(`Error calculating other goals rate: ${err.message}`);
    }

    // Ưu tiên forecastedSaving từ FE, fallback analytics
    const expectedSavingsAmount = forecastedSaving ?? analytics.aiBudgeting?.expectedSavingsAmount ?? 0;
    const remainingSavingCapacity = Math.max(0, expectedSavingsAmount - otherGoalsRequiredMonthlyRate);

    let daysSaved = 0;
    const remainingTarget = prediction.remainingAmount || 0;
    const currentVelocity = prediction.currentMonthlySavingRate || 0;

    let currentMilestoneRemaining = prediction.remainingAmount || 0;
    const now = new Date();
    const activeMilestone = milestones.find((m) => {
      const start = new Date(m.start_date);
      const end = new Date(m.end_date);
      return now >= start && now < end;
    });
    if (activeMilestone) {
      currentMilestoneRemaining = Math.max(0, activeMilestone.target - activeMilestone.actual);
    }

    let shortfall = 0;
    let daysDelayed = 0;

    // So sánh remainingSavingCapacity (sau khi trừ mục tiêu khác) với còn thiếu giai đoạn
    if (remainingSavingCapacity >= currentMilestoneRemaining) {
      // Dư tiền → tính số ngày hoàn thành sớm hơn
      const surplus = remainingSavingCapacity - currentMilestoneRemaining;
      const dailyRate = prediction.requiredDailySavingRate || 0;
      if (dailyRate > 0) {
        daysSaved = Math.round(surplus / dailyRate);
      }
    } else {
      // Thiếu tiền → tính shortfall và daysDelayed
      shortfall = currentMilestoneRemaining - remainingSavingCapacity;
      try {
        const profile = await this.personalizationService.getOrBuildProfile(userId);
        const avgSavings = profile?.averageMonthlySavings ?? 0;
        // netMonthlySaving = tiết kiệm trung bình - số tiền cần cho mục tiêu khác
        const netMonthlySaving = Math.max(0, avgSavings - otherGoalsRequiredMonthlyRate);
        if (netMonthlySaving > 0) {
          daysDelayed = Math.round((shortfall / netMonthlySaving) * 30);
        } else if (remainingSavingCapacity > 0) {
          daysDelayed = Math.round((shortfall / remainingSavingCapacity) * 30);
        } else {
          daysDelayed = 30; // fallback
        }
      } catch (err) {
        this.logger.error(`Error loading personalization profile: ${err.message}`);
        if (remainingSavingCapacity > 0) {
          daysDelayed = Math.round((shortfall / remainingSavingCapacity) * 30);
        } else {
          daysDelayed = 30;
        }
      }
    }

    const summary = this.buildSummary(
      prediction,
      expectedSavingsAmount,
      remainingSavingCapacity,
      daysSaved,
      currentMilestoneRemaining,
      daysDelayed,
      shortfall,
    );
    const payload = {
      summary,
      goalId: prediction.goalId,
      planId,
      canApplyBudget: budgetRecommendations.some((item) => item.canApply),
      confidence: prediction.confidence,
      milestones,
      goalEndDate,
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
        nextMonthPrediction: prediction.nextMonthPrediction,
      },
      budgetRecommendations,
      expectedSavingsAmount,
      otherGoalsRequiredRate: otherGoalsRequiredMonthlyRate,
      remainingSavingCapacity,
      daysSaved,
      currentMilestoneRemaining,
      shortfall,
      daysDelayed,
      contributionHistory: reportTransactions,
      habitSuggestions: shortfall > 0
        ? this.scopeHabitSuggestionsToShortfall(
            analytics.habitSuggestions || [],
            shortfall,
          )
        : [],
    };

    // Auto-delete commitments when shortfall disappears
    if (shortfall <= 0 && prediction.goalId) {
      this.clearGoalCommitments(userId, prediction.goalId).catch((err) =>
        this.logger.warn(`Failed to clear commitments for goal ${prediction.goalId}: ${err.message}`),
      );
    }

    const responseText = `__GOAL_ACHIEVEMENT_INSIGHT__${JSON.stringify(payload)}`;
    return ok('', responseText);
  }

  private buildSummary(
    prediction: any,
    expectedSavingsAmount: number,
    remainingSavingCapacity: number,
    daysSaved: number,
    currentMilestoneRemaining: number,
    daysDelayed: number,
    shortfall: number,
  ): string {
    const formattedExpected = Math.round(expectedSavingsAmount).toLocaleString('vi-VN');
    const formattedCapacity = Math.round(remainingSavingCapacity).toLocaleString('vi-VN');
    const formattedMilestoneRemaining = Math.round(currentMilestoneRemaining).toLocaleString('vi-VN');
    
    let summaryText = `Mục tiêu "${prediction.name}":\n`;
    summaryText += `- Đã tiết kiệm: ${Math.round(prediction.savedAmount).toLocaleString('vi-VN')} VND\n`;
    summaryText += `- Còn thiếu giai đoạn hiện tại: ${formattedMilestoneRemaining} VND\n`;
    summaryText += `- Tiết kiệm dự kiến tháng này: ${formattedExpected} VND\n`;
    
    if (shortfall > 0) {
      summaryText += `- Dự kiến tiết kiệm tháng này không đủ cho giai đoạn hiện tại (thiếu ${Math.round(shortfall).toLocaleString('vi-VN')} VND). Tiến độ sẽ bị chậm khoảng ${daysDelayed} ngày dựa trên mức tích lũy trung bình lịch sử.`;
    } else {
      if (daysSaved > 0) {
        summaryText += `- Nếu sử dụng số dư tiết kiệm khả dụng còn lại (${formattedCapacity} VND) sau khi trừ các mục tiêu khác, bạn có thể hoàn thành sớm hơn ${daysSaved} ngày.`;
      } else {
        summaryText += `- Số dư tiết kiệm khả dụng sau khi trừ mục tiêu khác: ${formattedCapacity} VND.`;
      }
    }
    return summaryText;
  }

  /**
   * Re-scope habit suggestions so total potentialSavings ≈ shortfall.
   * Only include enough items to cover the gap; adjust last item's
   * reduction count if it would exceed.
   */
  private scopeHabitSuggestionsToShortfall(
    suggestions: any[],
    shortfall: number,
  ): any[] {
    if (!suggestions.length || shortfall <= 0) return [];

    // Keep analytics' original order (new habits first, then committed)
    // Do NOT re-sort by potentialSavings — that would undo priority ordering

    const result: any[] = [];
    let remaining = shortfall;

    for (const s of suggestions) {
      if (remaining <= 0) break;

      const avg = s.avgPerTransaction || 0;
      if (avg <= 0) continue;

      // Analytics already calculated the correct suggestedCount
      // (respecting committed habits). Use its reduction as the max.
      const analyticsReduce = s.projectedMonthCount - s.suggestedCount;
      if (analyticsReduce <= 0) continue;

      // How many reductions needed for remaining gap?
      const neededReduce = Math.ceil(remaining / avg);
      const actualReduce = Math.min(neededReduce, analyticsReduce);
      const adjustedSavings = Math.round(actualReduce * avg);

      // Calculate adjusted suggestedCount from analytics' suggestedCount
      // (add back unused reductions)
      const adjustedSuggestedCount =
        s.suggestedCount + (analyticsReduce - actualReduce);

      result.push({
        ...s,
        suggestedCount: adjustedSuggestedCount,
        potentialSavings: adjustedSavings,
        suggestionText: `Bạn có thể cân nhắc giảm ${s.habitName} từ ~${s.projectedMonthCount} xuống ${adjustedSuggestedCount} lần/tháng, tiết kiệm ~${adjustedSavings.toLocaleString('vi-VN')}đ`,
      });

      remaining -= adjustedSavings;
    }

    return result.slice(0, 5);
  }

  /**
   * Xóa tất cả cam kết của 1 goal khi shortfall không còn.
   */
  private async clearGoalCommitments(
    userId: number,
    goalId: number,
  ): Promise<void> {
    await this.habitCommitmentsService.removeByGoal(userId, goalId);
    this.logger.log(`Cleared commitments for goal ${goalId} (shortfall resolved)`);
  }
}
