import { AiService } from './ai.service';
import {
  buildAiAnalysisCacheKey,
  buildAiAnalysisRegistryKey,
} from 'src/common/cache/financial-cache.util';

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
  const userRepo = { findOne: jest.fn() };

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    service = new AiService(
      transactionService as any,
      financialInsightsService as any,
      cacheService as any,
      fundRepo as any,
      categoryRepo as any,
      userRepo as any,
    );
  });

  it('returns cached analysis immediately on cache hit', async () => {
    const cached = '__STRUCTURED_ANALYSIS__{"summary":"cached"}';
    cacheService.get.mockResolvedValueOnce(cached);

    const result = await (service as any).handleAnalysis('phan tich chi tieu', 7, 2);

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
      .spyOn(service as any, 'buildIntentHash')
      .mockReturnValueOnce('81bce0d8');
    jest
      .spyOn(service, 'analyzeFinancialHealth')
      .mockResolvedValueOnce(analysisPayload as any);

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

    await (service as any).handleAnalysis('phan tich chi tieu', 9, 4);

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
});
