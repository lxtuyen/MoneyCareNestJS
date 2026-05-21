import { AiService } from './ai.service';
import { FinancialAnalysisResult } from './types/ai.types';
import {
  buildAiAnalysisCacheKey,
  buildAiAnalysisRegistryKey,
} from 'src/common/cache/financial-cache.util';
import { GoogleGenAI } from '@google/genai';
import {
  GoalPlanInsightDto,
  GoalPlanProgressStatus,
} from './dto/goal-plan-insight.dto';
import { Repository } from 'typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { FinancialInsightsService } from './financial-insights.service';
import { CacheService } from 'src/common/cache/cache.service';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoalsService } from 'src/modules/saving-goals/saving-goals.service';
import { SavingGoalsStatisticsService } from 'src/modules/saving-goals/saving-goals-statistics.service';
import { WalletsService } from 'src/modules/wallets/wallets.service';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: jest.fn(),
    },
  })),
  Type: {
    OBJECT: 'OBJECT',
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    ARRAY: 'ARRAY',
  },
}));

describe('AiService cache behavior', () => {
  const transactionService = { create: jest.fn() };
  const financialInsightsService = {
    getSelectedFundId: jest.fn(),
    getInsights: jest.fn(),
  };
  const cacheService = {
    get: jest.fn(),
    set: jest.fn(),
  };
  const fundRepo = { findOne: jest.fn() };
  const categoryRepo = { find: jest.fn() };
  const subCategoryRepo = { find: jest.fn() };
  const userRepo = { findOne: jest.fn() };
  const walletRepo = { find: jest.fn() };
  const spendingPlansService = {};
  const savingGoalsService = {};
  const savingGoalsStatisticsService = {
    getGoalReport: jest.fn().mockResolvedValue({
      success: true,
      data: {
        milestones: [],
      },
    }),
  };
  const walletsService = {};

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    service = new AiService(
      transactionService as unknown as TransactionService,
      financialInsightsService as unknown as FinancialInsightsService,
      cacheService as unknown as CacheService,
      fundRepo as unknown as Repository<SavingGoal>,
      categoryRepo as unknown as Repository<Category>,
      subCategoryRepo as unknown as Repository<SubCategory>,
      userRepo as unknown as Repository<User>,
      walletRepo as unknown as Repository<Wallet>,
      spendingPlansService as unknown as SpendingPlansService,
      savingGoalsService as unknown as SavingGoalsService,
      savingGoalsStatisticsService as unknown as SavingGoalsStatisticsService,
      walletsService as unknown as WalletsService,
    );
  });

  it('returns cached analysis immediately on cache hit', async () => {
    const cached = '__STRUCTURED_ANALYSIS__{"summary":"cached"}';
    cacheService.get.mockResolvedValueOnce(cached);

    const result = await (
      service as unknown as {
        handleAnalysis: (
          message: string,
          userId: number,
          goalId?: number,
        ) => Promise<ApiResponse<string>>;
      }
    ).handleAnalysis('phan tich chi tieu', 7, 2);

    expect(result).toEqual({ success: true, statusCode: 200, message: cached });
    expect(financialInsightsService.getInsights).not.toHaveBeenCalled();
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it('stores analysis key inside per-fund registry without duplicates', async () => {
    const analysisPayload = {
      summary: 'ok',
      budget_plan: [],
    };
    const analysisKey = buildAiAnalysisCacheKey(9, 4, '81bce0d8');
    const registryKey = buildAiAnalysisRegistryKey(9, 4);

    jest
      .spyOn(
        service as unknown as {
          buildIntentHash: (message: string) => string;
        },
        'buildIntentHash',
      )
      .mockReturnValueOnce('81bce0d8');
    jest
      .spyOn(service, 'analyzeFinancialHealth')
      .mockResolvedValueOnce(
        analysisPayload as unknown as FinancialAnalysisResult,
      );

    cacheService.get
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce([analysisKey]);
    userRepo.findOne.mockResolvedValueOnce({
      profile: { first_name: 'A', last_name: 'B' },
    });
    financialInsightsService.getInsights.mockResolvedValueOnce({
      period: 'last_30_days',
      generatedAt: new Date().toISOString(),
      incomeTotal: 0,
      expenseTotal: 0,
      netBalance: 0,
      dailyAverage: 0,
      topCategories: [],
      alerts: [],
      comparisonPrevMonth: {
        incomeChangePct: 0,
        expenseChangePct: 0,
        netBalanceChangePct: 0,
      },
    });

    await (
      service as unknown as {
        handleAnalysis: (
          message: string,
          userId: number,
          goalId?: number,
        ) => Promise<ApiResponse<string>>;
      }
    ).handleAnalysis('phan tich chi tieu', 9, 4);

    expect(cacheService.set).toHaveBeenNthCalledWith(
      1,
      analysisKey,
      '__STRUCTURED_ANALYSIS__{"summary":"ok","budget_plan":[]}',
      300,
    );
    expect(cacheService.set).toHaveBeenNthCalledWith(
      2,
      registryKey,
      [analysisKey],
      300,
    );
  });

  it('generates structured goal-plan insight from AI JSON', async () => {
    const generateContent = jest.fn().mockResolvedValueOnce({
      text: JSON.stringify({
        status: 'delayed',
        summary: 'Kế hoạch đang chậm tiến độ.',
        reason: 'Ăn uống vượt kế hoạch.',
        suggestion: 'Giảm ăn ngoài trong tuần này.',
      }),
    });
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: { generateContent },
    }));
    service = new AiService(
      transactionService as unknown as TransactionService,
      financialInsightsService as unknown as FinancialInsightsService,
      cacheService as unknown as CacheService,
      fundRepo as unknown as Repository<SavingGoal>,
      categoryRepo as unknown as Repository<Category>,
      subCategoryRepo as unknown as Repository<SubCategory>,
      userRepo as unknown as Repository<User>,
      walletRepo as unknown as Repository<Wallet>,
      spendingPlansService as unknown as SpendingPlansService,
      savingGoalsService as unknown as SavingGoalsService,
      savingGoalsStatisticsService as unknown as SavingGoalsStatisticsService,
      walletsService as unknown as WalletsService,
    );

    const result = await service.generateGoalPlanInsight(goalPlanInsightDto());

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      status: GoalPlanProgressStatus.DELAYED,
      summary: 'Kế hoạch đang chậm tiến độ.',
      reason: 'Ăn uống vượt kế hoạch.',
      suggestion: 'Giảm ăn ngoài trong tuần này.',
      projectedDaysDiff: 0,
      projectionStatus: 'on_track',
    });
  });

  it('returns fallback goal-plan insight when AI generation fails', async () => {
    const generateContent = jest.fn().mockRejectedValueOnce(new Error('boom'));
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      models: { generateContent },
    }));

    const mockActiveGoal = {
      id: 1,
      name: 'Mua xe',
    };
    fundRepo.findOne.mockResolvedValueOnce(mockActiveGoal);

    const mockStatsService = {
      getGoalReport: jest.fn().mockResolvedValueOnce({
        success: true,
        data: {
          milestones: [
            {
              start_date: new Date('2026-05-01'),
              target: 1000000,
              actual: 200000,
            },
          ],
        },
      }),
    };

    service = new AiService(
      transactionService as unknown as TransactionService,
      financialInsightsService as unknown as FinancialInsightsService,
      cacheService as unknown as CacheService,
      fundRepo as unknown as Repository<SavingGoal>,
      categoryRepo as unknown as Repository<Category>,
      subCategoryRepo as unknown as Repository<SubCategory>,
      userRepo as unknown as Repository<User>,
      walletRepo as unknown as Repository<Wallet>,
      spendingPlansService as unknown as SpendingPlansService,
      savingGoalsService as unknown as SavingGoalsService,
      mockStatsService as unknown as SavingGoalsStatisticsService,
      walletsService as unknown as WalletsService,
    );

    const result = await service.generateGoalPlanInsight(goalPlanInsightDto());

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe(GoalPlanProgressStatus.DELAYED);
    expect(result.data?.summary).toContain('trễ khoảng 74 ngày');
  });
});

function goalPlanInsightDto(): GoalPlanInsightDto {
  return {
    userId: 1,
    selectedMonth: '2026-05',
    goal: {
      name: 'Mua xe',
      status: GoalPlanProgressStatus.DELAYED,
    },
    plan: {
      name: 'Plan tháng 5',
      status: GoalPlanProgressStatus.DELAYED,
      plannedToDate: 1000000,
      actualSpent: 1200000,
      overAmount: 200000,
    },
    categories: [
      {
        name: 'Ăn uống',
        status: GoalPlanProgressStatus.DELAYED,
        plannedToDate: 500000,
        actualSpent: 650000,
        overAmount: 150000,
      },
    ],
  };
}
