import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { formatVnd } from 'src/common/utils/money.util';
import { safeJsonParse, stripJsonFence } from 'src/common/utils/json.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { SavingGoalMilestone } from 'src/modules/saving-goals/interfaces/saving-goal-report.interface';
import { SavingGoalsStatisticsService } from 'src/modules/saving-goals/saving-goals-statistics.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import {
  GoalPlanInsightDto,
  GoalPlanInsightResponseDto,
  GoalPlanProgressStatus,
} from './dto/goal-plan-insight.dto';
import { GoalPlanInsightResult } from './types/ai.types';
import { buildGoalPlanInsightFallback } from './helpers/goal-insight.helper';
import { getGoalPlanInsightPrompt } from './config/gemini-tools.config';

@Injectable()
export class AiGoalPlanInsightService {
  private readonly logger = new Logger(AiGoalPlanInsightService.name);

  constructor(
    private readonly savingGoalsStatisticsService: SavingGoalsStatisticsService,
    private readonly geminiClient: AiGeminiClientService,
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,
  ) {}

  async generateGoalPlanInsight(
    dto: GoalPlanInsightDto,
  ): Promise<ApiResponse<GoalPlanInsightResponseDto>> {
    let daysDiff = 0;
    let projectionStatus: 'early' | 'delayed' | 'on_track' = 'on_track';

    const [yearStr, monthStr] = dto.selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const now = new Date();
    let daysPassed = 1;
    if (now.getFullYear() === year && now.getMonth() + 1 === month) {
      daysPassed = Math.max(1, Math.min(now.getDate(), daysInMonth));
    } else {
      const selectedDate = new Date(year, month - 1, 1);
      if (selectedDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
        daysPassed = daysInMonth;
      } else {
        daysPassed = 1;
      }
    }

    let Tm = 0;
    let Sactual = 0;
    let goalName = dto.goal.name;

    try {
      const activeGoal =
        (await this.goalRepo.findOne({
          where: {
            user: { id: dto.userId },
            is_selected: true,
            is_completed: false,
          },
          relations: ['wallet'],
        })) ||
        (await this.goalRepo.findOne({
          where: { user: { id: dto.userId }, is_completed: false },
          relations: ['wallet'],
          order: { updated_at: 'DESC' },
        }));
      if (activeGoal) {
        goalName = activeGoal.name;
        const reportRes = await this.savingGoalsStatisticsService.getGoalReport(
          activeGoal.id,
          dto.userId,
        );
        if (reportRes.success && reportRes.data) {
          const report = reportRes.data;
          const currentMilestone = report.milestones?.find(
            (m: SavingGoalMilestone) => {
              const mStart = new Date(m.start_date);
              return (
                mStart.getFullYear() === year && mStart.getMonth() + 1 === month
              );
            },
          );
          if (currentMilestone) {
            Tm = Number(currentMilestone.target || 0);
            Sactual = Number(currentMilestone.actual || 0);
            const Ractual = Sactual / daysPassed;
            const stageTargetRemaining = Math.max(0, Tm - Sactual);
            const daysPlannedRemaining = daysInMonth - daysPassed;
            if (stageTargetRemaining <= 0) {
              daysDiff = 0;
              projectionStatus = 'on_track';
            } else if (Ractual <= 0) {
              daysDiff = 999;
              projectionStatus = 'delayed';
            } else {
              const daysActualNeeded = stageTargetRemaining / Ractual;
              daysDiff = daysActualNeeded - daysPlannedRemaining;
              daysDiff = Math.round(daysDiff);
              if (daysDiff > 0) {
                projectionStatus = 'delayed';
              } else if (daysDiff < 0) {
                projectionStatus = 'early';
              } else {
                projectionStatus = 'on_track';
              }
            }
          }
        }
      }
    } catch (e) {
      this.logger.error('Error calculating mathematical early/late days', e);
    }

    const fallback = buildGoalPlanInsightFallback(
      dto,
      daysDiff,
      projectionStatus,
    );
    const dtoJson = JSON.stringify({
      ...dto,
      daysDiff,
      projectionStatus,
      Tm,
      Sactual,
    });
    const prompt = getGoalPlanInsightPrompt(
      goalName,
      daysDiff,
      projectionStatus,
      formatVnd(Tm),
      formatVnd(Sactual),
      dtoJson,
    );

    try {
      const result = await this.geminiClient.generateContent(
        prompt,
        undefined,
        undefined,
        this.geminiClient.analysisModel,
      );
      const parsed = safeJsonParse<GoalPlanInsightResult>(
        stripJsonFence(result.text || ''),
        fallback,
      );
      const normalized = this.normalizeGoalPlanInsight(parsed, fallback);

      normalized.projectedDaysDiff = daysDiff;
      normalized.projectionStatus = projectionStatus;

      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: normalized,
        message: 'Generate goal plan insight successfully',
      });
    } catch (error) {
      this.logger.error('Generate goal plan insight failed', error);
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: fallback,
        message: 'Generate goal plan insight fallback result',
      });
    }
  }

  private normalizeGoalPlanInsight(
    value: GoalPlanInsightResult,
    fallback: GoalPlanInsightResponseDto,
  ): GoalPlanInsightResponseDto {
    const status =
      value.status === 'delayed'
        ? GoalPlanProgressStatus.DELAYED
        : GoalPlanProgressStatus.ON_TRACK;

    return {
      status,
      summary:
        typeof value.summary === 'string' && value.summary.trim()
          ? value.summary.trim()
          : fallback.summary,
      reason:
        typeof value.reason === 'string' && value.reason.trim()
          ? value.reason.trim()
          : fallback.reason,
      suggestion:
        typeof value.suggestion === 'string' && value.suggestion.trim()
          ? value.suggestion.trim()
          : fallback.suggestion,
    };
  }
}
