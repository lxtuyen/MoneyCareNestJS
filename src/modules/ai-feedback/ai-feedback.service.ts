import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateAiFeedbackDto } from './dto/create-ai-feedback.dto';
import {
  AiFeedbackAction,
  AiRecommendationFeedback,
  AiRecommendationType,
} from './entities/ai-recommendation-feedback.entity';
import {
  AiFeedbackCountSummary,
  AiFeedbackSummaryResponse,
  BudgetingFeedbackReadinessResponse,
  BudgetCategoryFeedbackSummary,
  BudgetFeedbackSummary,
  CategoryCorrectionSummary,
  CategoryFeedbackSummary,
  SavingGoalFeedbackSummary,
} from './dto/ai-feedback-summary.dto';

const VALID_ACTIONS_BY_TYPE: Record<AiRecommendationType, AiFeedbackAction[]> =
  {
    budget: ['accepted', 'modified', 'rejected', 'dismissed'],
    category: ['accepted', 'corrected', 'rejected'],
    saving_goal: ['accepted', 'modified', 'rejected', 'dismissed'],
    forecast_insight: ['helpful', 'not_helpful', 'dismissed'],
    chatbot: ['helpful', 'not_helpful', 'dismissed', 'accepted', 'rejected'],
  };

@Injectable()
export class AiFeedbackService {
  constructor(
    @InjectRepository(AiRecommendationFeedback)
    private readonly feedbackRepo: Repository<AiRecommendationFeedback>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(userId: number, dto: CreateAiFeedbackDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.validateAction(dto.recommendationType, dto.userAction);

    const feedback = this.feedbackRepo.create({
      user,
      userId,
      recommendationType: dto.recommendationType,
      recommendationId: dto.recommendationId,
      sourceModel: dto.sourceModel || null,
      sourceModelVersion: dto.sourceModelVersion || null,
      userAction: dto.userAction,
      sourcePayload: dto.sourcePayload,
      modifiedPayload: dto.modifiedPayload || null,
      contextPayload: dto.contextPayload || null,
      dataSource: dto.dataSource || 'real',
      outcomePayload: dto.outcomePayload || null,
      outcomeMeasuredAt: dto.outcomePayload ? new Date() : null,
      reasonText: dto.reasonText || null,
    });

    return this.feedbackRepo.save(feedback);
  }

  async getSummary(
    userId: number,
    type?: AiRecommendationType,
    period = 'last_90_days',
  ): Promise<AiFeedbackSummaryResponse> {
    if (type && !Object.keys(VALID_ACTIONS_BY_TYPE).includes(type)) {
      throw new BadRequestException(`Unsupported feedback type "${type}"`);
    }

    const feedbacks = await this.feedbackRepo.find({
      where: {
        userId,
        ...(type ? { recommendationType: type } : {}),
        ...this.buildPeriodWhere(period),
      },
      order: { createdAt: 'DESC' },
    });

    return this.buildSummary(feedbacks, type);
  }

  async getRecent(userId: number, limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
    const items = await this.feedbackRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: safeLimit,
    });

    return items.map((item) => ({
      id: item.id,
      recommendationType: item.recommendationType,
      recommendationId: item.recommendationId,
      userAction: item.userAction,
      sourceModel: item.sourceModel,
      dataSource: item.dataSource,
      hasOutcome: !!item.outcomePayload,
      createdAt: item.createdAt,
    }));
  }

  async recordOutcome(
    userId: number,
    feedbackId: number,
    outcomePayload: Record<string, unknown>,
  ) {
    const feedback = await this.feedbackRepo.findOne({
      where: { id: feedbackId, userId },
    });
    if (!feedback) {
      throw new NotFoundException('AI feedback not found');
    }

    feedback.outcomePayload = outcomePayload;
    feedback.outcomeMeasuredAt = new Date();
    return this.feedbackRepo.save(feedback);
  }

  async getBudgetingReadiness(
    userId: number,
    scope: 'user' | 'global' = 'user',
    includeSynthetic = false,
  ): Promise<BudgetingFeedbackReadinessResponse> {
    const feedbacks = await this.feedbackRepo.find({
      where: {
        ...(scope === 'user' ? { userId } : {}),
        recommendationType: 'budget',
      },
      order: { createdAt: 'ASC' },
    });

    const realFeedbacks = feedbacks.filter(
      (feedback) => feedback.dataSource !== 'synthetic',
    );
    const syntheticFeedbacks = feedbacks.filter(
      (feedback) => feedback.dataSource === 'synthetic',
    );
    const scoringFeedbacks = includeSynthetic ? feedbacks : realFeedbacks;

    const accepted = scoringFeedbacks.filter(
      (feedback) => feedback.userAction === 'accepted',
    ).length;
    const rejected = scoringFeedbacks.filter(
      (feedback) => feedback.userAction === 'rejected',
    ).length;
    const modified = scoringFeedbacks.filter(
      (feedback) => feedback.userAction === 'modified',
    ).length;

    const categoryCounts = new Map<string, number>();
    const months = new Set<string>();
    let outcomeCount = 0;

    for (const feedback of scoringFeedbacks) {
      const categoryName =
        this.readString(feedback.sourcePayload, 'categoryName') || 'Unknown';
      categoryCounts.set(
        categoryName,
        (categoryCounts.get(categoryName) || 0) + 1,
      );

      const createdMonth = feedback.createdAt.toISOString().slice(0, 7);
      months.add(createdMonth);

      if (feedback.outcomePayload) {
        outcomeCount += 1;
      }
    }

    const categoryCoverage = Array.from(categoryCounts.entries())
      .map(([categoryName, count]) => ({ categoryName, count }))
      .sort((a, b) => b.count - a.count);
    const categoriesWithEnoughSamples = categoryCoverage.filter(
      (item) => item.count >= 30,
    ).length;

    const criteria = {
      totalFeedbackAtLeast500: scoringFeedbacks.length >= 500,
      balancedActions: accepted >= 100 && rejected >= 50 && modified >= 50,
      categoryCoverageAtLeast5: categoriesWithEnoughSamples >= 5,
      outcomeAtLeast200: outcomeCount >= 200,
      monthCoverageAtLeast3: months.size >= 3,
    };

    const score =
      (criteria.totalFeedbackAtLeast500 ? 25 : 0) +
      (criteria.balancedActions ? 25 : 0) +
      (criteria.categoryCoverageAtLeast5 ? 20 : 0) +
      (criteria.outcomeAtLeast200 ? 20 : 0) +
      (criteria.monthCoverageAtLeast3 ? 10 : 0);

    return {
      score,
      scope,
      recommendation: this.resolveBudgetingReadinessRecommendation(score),
      totalFeedback: scoringFeedbacks.length,
      realFeedbackCount: realFeedbacks.length,
      syntheticFeedbackCount: syntheticFeedbacks.length,
      actionDistribution: {
        accepted,
        rejected,
        modified,
      },
      categoryCoverage,
      outcomeCount,
      monthCoverage: months.size,
      criteria,
    };
  }

  buildBudgetFeedbackSummary(
    feedbacks: AiRecommendationFeedback[],
  ): BudgetFeedbackSummary {
    const base = this.buildCountSummary(feedbacks);
    const deltas: number[] = [];
    const categoryMap = new Map<
      string,
      {
        count: number;
        modifiedCount: number;
        rejectedCount: number;
        acceptedCount: number;
        deltaPcts: number[];
        finalLimits: number[];
      }
    >();

    for (const feedback of feedbacks) {
      const categoryName =
        this.readString(feedback.sourcePayload, 'categoryName') || 'Unknown';
      const bucket = categoryMap.get(categoryName) || {
        count: 0,
        modifiedCount: 0,
        rejectedCount: 0,
        acceptedCount: 0,
        deltaPcts: [],
        finalLimits: [],
      };

      bucket.count += 1;
      if (feedback.userAction === 'modified') bucket.modifiedCount += 1;
      if (feedback.userAction === 'rejected') bucket.rejectedCount += 1;
      if (feedback.userAction === 'accepted') bucket.acceptedCount += 1;

      const recommended = this.readNumber(
        feedback.sourcePayload,
        'recommendedLimitAmount',
      );
      const finalLimit =
        this.readNumber(feedback.modifiedPayload, 'finalLimitAmount') ??
        (feedback.userAction === 'accepted' ? recommended : null);

      if (recommended && finalLimit !== null) {
        const deltaPct = (finalLimit - recommended) / recommended;
        bucket.deltaPcts.push(deltaPct);
        bucket.finalLimits.push(finalLimit);
        if (feedback.userAction === 'modified') {
          deltas.push(deltaPct);
        }
      }

      categoryMap.set(categoryName, bucket);
    }

    const categoryPreferences: BudgetCategoryFeedbackSummary[] = Array.from(
      categoryMap.entries(),
    )
      .map(([categoryName, bucket]) => ({
        categoryName,
        count: bucket.count,
        modifiedCount: bucket.modifiedCount,
        rejectedCount: bucket.rejectedCount,
        acceptedCount: bucket.acceptedCount,
        averageDeltaPct: this.roundRate(this.average(bucket.deltaPcts)),
        rejectionRate: this.roundRate(bucket.rejectedCount / bucket.count),
        acceptedRate: this.roundRate(bucket.acceptedCount / bucket.count),
        preferredLimitAvg: this.roundAmount(this.average(bucket.finalLimits)),
      }))
      .sort((a, b) => b.count - a.count);

    return {
      ...base,
      averageModificationDeltaPct: this.roundRate(this.average(deltas)),
      categoryPreferences,
    };
  }

  buildCategoryFeedbackSummary(
    feedbacks: AiRecommendationFeedback[],
  ): CategoryFeedbackSummary {
    const total = feedbacks.length;
    const acceptedCount = feedbacks.filter(
      (f) => f.userAction === 'accepted',
    ).length;
    const correctedFeedbacks = feedbacks.filter(
      (f) => f.userAction === 'corrected',
    );
    const rejectedCount = feedbacks.filter(
      (f) => f.userAction === 'rejected',
    ).length;

    const keywordMap = new Map<string, CategoryCorrectionSummary>();
    const merchantMap = new Map<string, CategoryCorrectionSummary>();

    for (const feedback of correctedFeedbacks) {
      const finalCategoryName =
        this.readString(feedback.modifiedPayload, 'finalCategoryName') ||
        'Unknown';
      const inputText = this.readString(feedback.sourcePayload, 'inputText');
      const keyword = inputText ? this.extractKeyword(inputText) : null;
      const merchant = this.readString(feedback.sourcePayload, 'merchant');

      if (keyword) {
        this.incrementCorrection(
          keywordMap,
          keyword,
          finalCategoryName,
          'keyword',
        );
      }
      if (merchant) {
        this.incrementCorrection(
          merchantMap,
          merchant,
          finalCategoryName,
          'merchant',
        );
      }
    }

    return {
      totalCount: total,
      acceptedCount,
      correctedCount: correctedFeedbacks.length,
      rejectedCount,
      correctionRate:
        total > 0 ? this.roundRate(correctedFeedbacks.length / total) : 0,
      personalCorrections: this.sortedCorrections(keywordMap),
      correctionByMerchant: this.sortedCorrections(merchantMap),
    };
  }

  buildSavingGoalFeedbackSummary(
    feedbacks: AiRecommendationFeedback[],
  ): SavingGoalFeedbackSummary {
    const durationDeltas: number[] = [];
    const monthlySavingDeltas: number[] = [];

    for (const feedback of feedbacks) {
      const recommendedDuration = this.readNumber(
        feedback.sourcePayload,
        'recommendedDuration',
      );
      const finalDuration = this.readNumber(
        feedback.modifiedPayload,
        'finalDuration',
      );
      if (recommendedDuration !== null && finalDuration !== null) {
        durationDeltas.push(finalDuration - recommendedDuration);
      }

      const recommendedMonthlySaving = this.readNumber(
        feedback.sourcePayload,
        'recommendedMonthlySaving',
      );
      const finalMonthlySaving = this.readNumber(
        feedback.modifiedPayload,
        'finalMonthlySaving',
      );
      if (recommendedMonthlySaving !== null && finalMonthlySaving !== null) {
        monthlySavingDeltas.push(finalMonthlySaving - recommendedMonthlySaving);
      }
    }

    return {
      ...this.buildCountSummary(feedbacks),
      averageDurationDelta: this.roundAmount(this.average(durationDeltas)),
      averageMonthlySavingDelta: this.roundAmount(
        this.average(monthlySavingDeltas),
      ),
    };
  }

  private buildSummary(
    feedbacks: AiRecommendationFeedback[],
    type?: AiRecommendationType,
  ): AiFeedbackSummaryResponse {
    const grouped = this.groupByType(feedbacks);

    if (type) {
      return this.summaryForType(type, grouped[type] || []);
    }

    return {
      budget: this.buildBudgetFeedbackSummary(grouped.budget || []),
      category: this.buildCategoryFeedbackSummary(grouped.category || []),
      savingGoal: this.buildSavingGoalFeedbackSummary(
        grouped.saving_goal || [],
      ),
      forecastInsight: this.buildCountSummary(grouped.forecast_insight || []),
      chatbot: this.buildCountSummary(grouped.chatbot || []),
    };
  }

  private summaryForType(
    type: AiRecommendationType,
    feedbacks: AiRecommendationFeedback[],
  ) {
    if (type === 'budget') return this.buildBudgetFeedbackSummary(feedbacks);
    if (type === 'category')
      return this.buildCategoryFeedbackSummary(feedbacks);
    if (type === 'saving_goal')
      return this.buildSavingGoalFeedbackSummary(feedbacks);
    return this.buildCountSummary(feedbacks);
  }

  private buildCountSummary(
    feedbacks: AiRecommendationFeedback[],
  ): AiFeedbackCountSummary {
    const total = feedbacks.length;
    const acceptedCount = feedbacks.filter(
      (f) => f.userAction === 'accepted',
    ).length;
    const modifiedCount = feedbacks.filter(
      (f) => f.userAction === 'modified',
    ).length;
    const rejectedCount = feedbacks.filter(
      (f) => f.userAction === 'rejected',
    ).length;
    const dismissedCount = feedbacks.filter(
      (f) => f.userAction === 'dismissed',
    ).length;

    return {
      totalCount: total,
      acceptedCount,
      modifiedCount,
      rejectedCount,
      dismissedCount,
      acceptanceRate: total > 0 ? this.roundRate(acceptedCount / total) : 0,
      modificationRate: total > 0 ? this.roundRate(modifiedCount / total) : 0,
      rejectionRate: total > 0 ? this.roundRate(rejectedCount / total) : 0,
    };
  }

  private groupByType(feedbacks: AiRecommendationFeedback[]) {
    return feedbacks.reduce(
      (acc, feedback) => {
        const list = acc[feedback.recommendationType] || [];
        list.push(feedback);
        acc[feedback.recommendationType] = list;
        return acc;
      },
      {} as Partial<Record<AiRecommendationType, AiRecommendationFeedback[]>>,
    );
  }

  private validateAction(type: AiRecommendationType, action: AiFeedbackAction) {
    const validActions = VALID_ACTIONS_BY_TYPE[type] || [];
    if (!validActions.includes(action)) {
      throw new BadRequestException(
        `Action "${action}" is not valid for recommendation type "${type}"`,
      );
    }
  }

  private resolveBudgetingReadinessRecommendation(
    score: number,
  ): BudgetingFeedbackReadinessResponse['recommendation'] {
    if (score > 85) return 'ready_for_ml_budgeting';
    if (score >= 70) return 'enable_category_reranker';
    if (score >= 50) return 'train_offline_only';
    return 'rule_based_only';
  }

  private buildPeriodWhere(period: string) {
    if (period === 'all') return {};

    const now = new Date();
    const start = new Date(now);
    const periodMap: Record<string, number> = {
      last_30_days: 30,
      last_90_days: 90,
      last_180_days: 180,
    };
    const days = periodMap[period] ?? periodMap.last_90_days;
    start.setDate(start.getDate() - days);

    return { createdAt: Between(start, now) };
  }

  private readNumber(
    payload: Record<string, any> | null,
    key: string,
  ): number | null {
    const value = payload?.[key];
    if (value === null || value === undefined) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private readString(
    payload: Record<string, any> | null,
    key: string,
  ): string | null {
    const value = payload?.[key];
    if (value === null || value === undefined) return null;
    const stringValue = String(value).trim();
    return stringValue.length === 0 ? null : stringValue;
  }

  private extractKeyword(inputText: string): string | null {
    const normalized = inputText
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .find((part) => part.length >= 3);
    return normalized || null;
  }

  private incrementCorrection(
    map: Map<string, CategoryCorrectionSummary>,
    key: string,
    finalCategoryName: string,
    kind: 'keyword' | 'merchant',
  ) {
    const mapKey = `${key.toLowerCase()}|${finalCategoryName.toLowerCase()}`;
    const existing = map.get(mapKey);
    if (existing) {
      existing.count += 1;
      return;
    }

    map.set(mapKey, {
      [kind]: key,
      finalCategoryName,
      count: 1,
    });
  }

  private sortedCorrections(map: Map<string, CategoryCorrectionSummary>) {
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private average(values: number[]) {
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private roundRate(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 10000) / 10000;
  }

  private roundAmount(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100) / 100;
  }
}
