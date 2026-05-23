import { BadRequestException } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiChatRouterService } from './ai-chat-router.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { AiGoalPlanInsightService } from './ai-goal-plan-insight.service';
import { AiTransactionChatService } from './ai-transaction-chat.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { GoalPlanInsightDto } from './dto/goal-plan-insight.dto';

describe('AiService facade', () => {
  const chatRouterService = { handle: jest.fn() };
  const analysisChatService = {
    analyzeFinancialHealth: jest.fn(),
    chatAnswer: jest.fn(),
  };
  const goalPlanInsightService = { generateGoalPlanInsight: jest.fn() };
  const transactionChatService = { parseTransaction: jest.fn() };
  const receiptOcrService = { scanReceipt: jest.fn() };

  let service: AiService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiService(
      chatRouterService as unknown as AiChatRouterService,
      analysisChatService as unknown as AiAnalysisChatService,
      goalPlanInsightService as unknown as AiGoalPlanInsightService,
      transactionChatService as unknown as AiTransactionChatService,
      receiptOcrService as unknown as ReceiptOcrService,
    );
  });

  it('validates user id before delegating chat handling', async () => {
    await expect(service.handle('hello', 'bad')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(chatRouterService.handle).not.toHaveBeenCalled();
  });

  it('delegates chat handling with normalized numeric user id', async () => {
    chatRouterService.handle.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'ok',
    });

    const result = await service.handle('hello', '7', 'ocr', 'lines');

    expect(result.message).toBe('ok');
    expect(chatRouterService.handle).toHaveBeenCalledWith(
      'hello',
      7,
      'ocr',
      'lines',
    );
  });

  it('keeps scan receipt and goal insight wrappers available', async () => {
    receiptOcrService.scanReceipt.mockResolvedValueOnce({ success: true });
    goalPlanInsightService.generateGoalPlanInsight.mockResolvedValueOnce({
      success: true,
    });

    await service.scanReceipt({});
    await service.generateGoalPlanInsight({} as GoalPlanInsightDto);

    expect(receiptOcrService.scanReceipt).toHaveBeenCalledWith({}, []);
    expect(goalPlanInsightService.generateGoalPlanInsight).toHaveBeenCalledWith(
      {},
    );
  });
});
