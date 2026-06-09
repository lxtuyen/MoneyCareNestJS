import { AiChatRouterService } from './ai-chat-router.service';
import { FinancialInsightsService } from './financial-insights.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { AiSavingGoalChatService } from './ai-saving-goal-chat.service';
import { AiTransactionChatService } from './ai-transaction-chat.service';
import { AiScenarioWhatIfChatService } from './ai-scenario-what-if-chat.service';
import { AiBudgetRecommendationChatService } from './ai-budget-recommendation-chat.service';
import { AiGoalAchievementChatService } from './ai-goal-achievement-chat.service';

describe('AiChatRouterService', () => {
  const financialInsightsService = { getSelectedGoalId: jest.fn() };
  const analysisChatService = {
    isAnalysisRequest: jest.fn(),
    handleAnalysis: jest.fn(),
  };
  const savingGoalChatService = {
    isSavingGoalRequest: jest.fn(),
    handleConfirmSavingGoal: jest.fn(),
    handleChangeSavingGoalDuration: jest.fn(),
    handleSavingGoalInitFund: jest.fn(),
    handleSavingGoalRequest: jest.fn(),
  };
  const transactionChatService = {
    isGetTransactionRequest: jest.fn(),
    handleReceiptOcr: jest.fn(),
    handleGetTransactions: jest.fn(),
    handleRecordOrChat: jest.fn(),
  };
  const scenarioWhatIfChatService = {
    isWhatIfRequest: jest.fn(),
    handleWhatIf: jest.fn(),
  };
  const budgetRecommendationChatService = {
    isBudgetRecommendationRequest: jest.fn(),
    handleBudgetRecommendation: jest.fn(),
  };
  const goalAchievementChatService = {
    isGoalAchievementRequest: jest.fn(),
    handleGoalAchievementInsight: jest.fn(),
  };

  let router: AiChatRouterService;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new AiChatRouterService(
      financialInsightsService as unknown as FinancialInsightsService,
      analysisChatService as unknown as AiAnalysisChatService,
      savingGoalChatService as unknown as AiSavingGoalChatService,
      transactionChatService as unknown as AiTransactionChatService,
      scenarioWhatIfChatService as unknown as AiScenarioWhatIfChatService,
      budgetRecommendationChatService as unknown as AiBudgetRecommendationChatService,
      goalAchievementChatService as unknown as AiGoalAchievementChatService,
    );
  });

  it('routes saving goal commands before intent checks', async () => {
    savingGoalChatService.handleConfirmSavingGoal.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'created',
    });

    const result = await router.handle('/confirm_saving_goal {"x":1}', 1);

    expect(result.message).toBe('created');
    expect(savingGoalChatService.handleConfirmSavingGoal).toHaveBeenCalledWith(
      '/confirm_saving_goal {"x":1}',
      1,
    );
    expect(financialInsightsService.getSelectedGoalId).not.toHaveBeenCalled();
    expect(analysisChatService.isAnalysisRequest).not.toHaveBeenCalled();
  });

  it('routes OCR before selected goal lookup', async () => {
    transactionChatService.handleReceiptOcr.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'receipt',
    });

    const result = await router.handle(undefined, 2, 'raw ocr');

    expect(result.message).toBe('receipt');
    expect(transactionChatService.handleReceiptOcr).toHaveBeenCalledWith(
      2,
      'raw ocr',
      undefined,
    );
    expect(financialInsightsService.getSelectedGoalId).not.toHaveBeenCalled();
  });

  it('routes saving goal intent before transaction query and fallback chat', async () => {
    financialInsightsService.getSelectedGoalId.mockResolvedValueOnce(5);
    analysisChatService.isAnalysisRequest.mockReturnValueOnce(false);
    savingGoalChatService.isSavingGoalRequest.mockReturnValueOnce(true);
    savingGoalChatService.handleSavingGoalRequest.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'proposal',
    });

    const result = await router.handle('toi muon tiet kiem 5 trieu', 3);

    expect(result.message).toBe('proposal');
    expect(savingGoalChatService.handleSavingGoalRequest).toHaveBeenCalledWith(
      'toi muon tiet kiem 5 trieu',
      3,
    );
    expect(
      transactionChatService.isGetTransactionRequest,
    ).not.toHaveBeenCalled();
    expect(transactionChatService.handleRecordOrChat).not.toHaveBeenCalled();
  });

  it('routes what-if before transaction recording', async () => {
    financialInsightsService.getSelectedGoalId.mockResolvedValueOnce(7);
    scenarioWhatIfChatService.isWhatIfRequest.mockReturnValueOnce(true);
    scenarioWhatIfChatService.handleWhatIf.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'what-if answer',
    });

    const result = await router.handle(
      'nếu tôi đi ăn Haidilao 100k thì sao',
      4,
    );

    expect(result.message).toBe('what-if answer');
    expect(scenarioWhatIfChatService.handleWhatIf).toHaveBeenCalledWith(
      'nếu tôi đi ăn Haidilao 100k thì sao',
      4,
      7,
    );
    expect(transactionChatService.handleRecordOrChat).not.toHaveBeenCalled();
  });

  it('routes goal budget adjust request to goal achievement insight', async () => {
    financialInsightsService.getSelectedGoalId.mockResolvedValueOnce(7);
    goalAchievementChatService.isGoalAchievementRequest.mockReturnValueOnce(
      true,
    );
    goalAchievementChatService.handleGoalAchievementInsight.mockResolvedValueOnce(
      {
        success: true,
        statusCode: 200,
        message: 'goal budget adjust response',
      },
    );

    const result = await router.handle(
      'giup toi dieu chinh ngan sach de dat muc tieu',
      8,
    );

    expect(result.message).toBe('goal budget adjust response');
    expect(
      goalAchievementChatService.handleGoalAchievementInsight,
    ).toHaveBeenCalledWith(8);
  });

  it('routes goal achievement insight before saving goal creation', async () => {
    financialInsightsService.getSelectedGoalId.mockResolvedValueOnce(7);
    analysisChatService.isAnalysisRequest.mockReturnValueOnce(false);
    goalAchievementChatService.isGoalAchievementRequest.mockReturnValueOnce(
      true,
    );
    goalAchievementChatService.handleGoalAchievementInsight.mockResolvedValueOnce(
      {
        success: true,
        statusCode: 200,
        message: 'goal insight response',
      },
    );

    const result = await router.handle('muc tieu cua toi co kip han khong', 6);

    expect(result.message).toBe('goal insight response');
    expect(
      goalAchievementChatService.handleGoalAchievementInsight,
    ).toHaveBeenCalledWith(6);
    expect(savingGoalChatService.isSavingGoalRequest).not.toHaveBeenCalled();
  });

  it('routes budget recommendation requests before what-if or other intents', async () => {
    financialInsightsService.getSelectedGoalId.mockResolvedValueOnce(7);
    budgetRecommendationChatService.isBudgetRecommendationRequest.mockReturnValueOnce(
      true,
    );
    budgetRecommendationChatService.handleBudgetRecommendation.mockResolvedValueOnce(
      {
        success: true,
        statusCode: 200,
        message: 'budget recommendation response',
      },
    );

    const result = await router.handle('đề xuất ngân sách', 5);

    expect(result.message).toBe('budget recommendation response');
    expect(
      budgetRecommendationChatService.handleBudgetRecommendation,
    ).toHaveBeenCalledWith(5);
    expect(scenarioWhatIfChatService.isWhatIfRequest).not.toHaveBeenCalled();
    expect(transactionChatService.handleRecordOrChat).not.toHaveBeenCalled();
  });
});
