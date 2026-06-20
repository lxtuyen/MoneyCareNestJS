import { BadRequestException, Injectable } from '@nestjs/common';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { Category } from 'src/modules/categories/entities/category.entity';
import { AiChatRouterService } from './ai-chat-router.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { AiGoalPlanInsightService } from './ai-goal-plan-insight.service';
import { AiTransactionChatService } from './ai-transaction-chat.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import {
  ChatTransactionResult,
  CatOption,
  FinancialAnalysisResult,
  FinancialInsightSnapshot,
} from './types/ai.types';
import {
  GoalPlanInsightDto,
  GoalPlanInsightResponseDto,
} from './dto/goal-plan-insight.dto';
import { ScanReceiptResponse } from './types/receipt.types';

@Injectable()
export class AiService {
  constructor(
    private readonly chatRouterService: AiChatRouterService,
    private readonly analysisChatService: AiAnalysisChatService,
    private readonly goalPlanInsightService: AiGoalPlanInsightService,
    private readonly transactionChatService: AiTransactionChatService,
    private readonly receiptOcrService: ReceiptOcrService,
    private readonly geminiClient: AiGeminiClientService,
  ) {}

  async handle(
    message: string | undefined,
    userIdRaw: unknown,
    ocrText?: string,
    ocrLines?: string,
    goalId?: number,
    forecastedSaving?: number,
  ): Promise<ApiResponse<string>> {
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId must be a number');
    }

    return this.chatRouterService.handle(message, userId, ocrText, ocrLines, goalId, forecastedSaving);
  }

  async scanReceipt(
    body: Record<string, string | undefined>,
    categories: Category[] = [],
  ): Promise<ApiResponse<ScanReceiptResponse>> {
    return this.receiptOcrService.scanReceipt(body, categories);
  }

  async generateGoalPlanInsight(
    dto: GoalPlanInsightDto,
  ): Promise<ApiResponse<GoalPlanInsightResponseDto>> {
    return this.goalPlanInsightService.generateGoalPlanInsight(dto);
  }

  async parseTransaction(
    message: string,
    options: CatOption[],
    wallets: Array<{ id: number; name: string }> = [],
  ): Promise<ChatTransactionResult> {
    return this.transactionChatService.parseTransaction(
      message,
      options,
      wallets,
    );
  }

  async analyzeFinancialHealth(
    text: string,
    insightData: FinancialInsightSnapshot,
    userName: string,
  ): Promise<FinancialAnalysisResult | string> {
    return this.analysisChatService.analyzeFinancialHealth(
      text,
      insightData,
      userName,
    );
  }

  async chatAnswer(text: string): Promise<string> {
    return this.analysisChatService.chatAnswer(text);
  }
}
