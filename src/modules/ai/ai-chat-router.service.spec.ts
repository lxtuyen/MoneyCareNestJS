import { AiChatRouterService } from './ai-chat-router.service';
import { FinancialInsightsService } from './financial-insights.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { AiSavingGoalChatService } from './ai-saving-goal-chat.service';
import { AiTransactionChatService } from './ai-transaction-chat.service';

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

  let router: AiChatRouterService;

  beforeEach(() => {
    jest.clearAllMocks();
    router = new AiChatRouterService(
      financialInsightsService as unknown as FinancialInsightsService,
      analysisChatService as unknown as AiAnalysisChatService,
      savingGoalChatService as unknown as AiSavingGoalChatService,
      transactionChatService as unknown as AiTransactionChatService,
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
});
