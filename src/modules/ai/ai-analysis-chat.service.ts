import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import JSON5 from 'json5';
import { Repository } from 'typeorm';
import { ok } from 'src/common/utils/response.util';
import { buildIntentHash, norm } from 'src/common/utils/string.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildAiAnalysisCacheKey,
  buildAiAnalysisRegistryKey,
} from 'src/common/cache/financial-cache.util';
import { FinancialInsightsService } from './financial-insights.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import { PersonalizationService } from 'src/modules/personalization/personalization.service';
import { AnalyticsService } from 'src/modules/analytics/analytics.service';
import { getVietnamNow } from 'src/common/utils/date.util';
import {
  AiMessagePrefix,
  FinancialAnalysisResult,
  FinancialInsightSnapshot,
} from './types/ai.types';
import { mapChatbotExpenseAnalysisPayload } from './mappers/chatbot-expense-analysis.mapper';
import {
  getChatAnswerPrompt,
  getFinancialHealthAnalysisPrompt,
} from './config/gemini-tools.config';

const AI_ANALYSIS_TTL_SECONDS = 300;
const AI_ANALYSIS_REGISTRY_TTL_SECONDS = 300;
const CHAT_TTL_SECONDS = 60;

@Injectable()
export class AiAnalysisChatService {
  private readonly logger = new Logger(AiAnalysisChatService.name);

  constructor(
    private readonly financialInsightsService: FinancialInsightsService,
    private readonly cacheService: CacheService,
    private readonly geminiClient: AiGeminiClientService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly personalizationService: PersonalizationService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  isAnalysisRequest(message: string): boolean {
    const lowerMessage = norm(message || '');
    return (
      lowerMessage.includes('phan tich') ||
      lowerMessage.includes('ke hoach') ||
      lowerMessage.includes('ngan sach') ||
      lowerMessage.includes('khuyen')
    );
  }

  private buildChatCacheKey(message: string): string {
    return `v1:ai_chat:${buildIntentHash(message)}`;
  }

  private async registerAnalysisCacheKey(
    userId: number,
    fundId: number,
    analysisCacheKey: string,
  ): Promise<void> {
    const registryKey = buildAiAnalysisRegistryKey(userId, fundId);
    const existingKeys =
      (await this.cacheService.get<string[]>(registryKey)) ?? [];
    const dedupedKeys = Array.from(
      new Set([...existingKeys, analysisCacheKey]),
    );
    await this.cacheService.set(
      registryKey,
      dedupedKeys,
      Math.max(AI_ANALYSIS_REGISTRY_TTL_SECONDS, AI_ANALYSIS_TTL_SECONDS),
    );
  }

  async handleAnalysis(
    message: string,
    userId: number,
    goalId?: number,
  ): Promise<ApiResponse<string>> {
    const resolvedGoalId =
      goalId ??
      (await this.financialInsightsService.getSelectedGoalId(userId)) ??
      0;

    const intentHash = buildIntentHash(message);
    const analysisCacheKey = buildAiAnalysisCacheKey(
      userId,
      resolvedGoalId,
      intentHash,
    );
    const cachedResult = await this.cacheService.get<string>(analysisCacheKey);
    if (cachedResult !== null) {
      return ok('', cachedResult);
    }

    const targetPeriod = this.resolveAnalysisTargetPeriod(message);

    const [user, insights, personalizationProfile, analyticsSummary] =
      await Promise.all([
        this.userRepo.findOne({
          where: { id: userId },
          relations: ['profile'],
        }),
        this.financialInsightsService.getMonthlyInsights(
          userId,
          resolvedGoalId || undefined,
          targetPeriod.month,
          targetPeriod.year,
        ),
        this.personalizationService.getProfileSummary(userId),
        this.analyticsService.getFinancialSummary(userId, {
          targetMonth: targetPeriod.month,
          targetYear: targetPeriod.year,
        }),
      ]);

    const userName = user?.profile
      ? `${user.profile.first_name || ''} ${user.profile.last_name || ''}`.trim()
      : 'Nguoi dung';

    const analysis =
      analyticsSummary.success && analyticsSummary.data
        ? mapChatbotExpenseAnalysisPayload(analyticsSummary.data, insights)
        : await this.analyzeFinancialHealth(
            message,
            insights,
            userName || 'Nguoi dung',
            personalizationProfile,
          );

    const resultString =
      typeof analysis === 'object'
        ? `${AiMessagePrefix.STRUCTURED_ANALYSIS}${JSON.stringify(analysis)}`
        : analysis;

    await this.cacheService.set(
      analysisCacheKey,
      resultString,
      AI_ANALYSIS_TTL_SECONDS,
    );
    await this.registerAnalysisCacheKey(
      userId,
      resolvedGoalId,
      analysisCacheKey,
    );

    return ok('', resultString);
  }

  async analyzeFinancialHealth(
    text: string,
    insightData: FinancialInsightSnapshot,
    userName: string,
    personalizationProfile?: any,
  ): Promise<FinancialAnalysisResult | string> {
    const prompt = getFinancialHealthAnalysisPrompt(
      userName,
      JSON.stringify(insightData),
      text,
      personalizationProfile
        ? JSON.stringify(personalizationProfile)
        : undefined,
    );

    try {
      const result = await this.geminiClient.generateContent(
        prompt,
        undefined,
        undefined,
        this.geminiClient.analysisModel,
      );
      let raw = (result.text || '').trim();
      if (raw.startsWith('```')) {
        raw = raw
          .replace(/```[\w]*\n?/g, '')
          .replace(/```$/, '')
          .trim();
      }
      return JSON5.parse(raw);
    } catch (error) {
      this.logger.error('Parse analysis JSON failed', error);
      return 'Tôi gặp lỗi khi chuẩn bị kế hoạch tài chính cho bạn. Hãy thử lại.';
    }
  }

  async chatAnswer(text: string): Promise<string> {
    const cacheKey = this.buildChatCacheKey(text);
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const prompt = getChatAnswerPrompt(text);
    const result = await this.geminiClient.generateContent(
      prompt,
      undefined,
      undefined,
      this.geminiClient.chatModel,
    );
    const answer = (result.text || '').trim();
    await this.cacheService.set(cacheKey, answer, CHAT_TTL_SECONDS);
    return answer;
  }

  private resolveAnalysisTargetPeriod(message: string): {
    month: number;
    year: number;
  } {
    const now = getVietnamNow();
    const normalized = norm(message || '');
    const monthMatch = /(?:thang|tháng)\s*(1[0-2]|[1-9])(?:\D+(20\d{2}))?/.exec(
      normalized,
    );

    if (!monthMatch) {
      return {
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      };
    }

    return {
      month: Number(monthMatch[1]),
      year: monthMatch[2] ? Number(monthMatch[2]) : now.getFullYear(),
    };
  }
}
