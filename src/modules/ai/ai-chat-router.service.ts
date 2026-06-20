import { Injectable } from '@nestjs/common';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { FinancialInsightsService } from './financial-insights.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { AiSavingGoalChatService } from './ai-saving-goal-chat.service';
import { AiTransactionChatService } from './ai-transaction-chat.service';
import { AiScenarioWhatIfChatService } from './ai-scenario-what-if-chat.service';
import { AiBudgetRecommendationChatService } from './ai-budget-recommendation-chat.service';
import { AiGoalAchievementChatService } from './ai-goal-achievement-chat.service';

@Injectable()
export class AiChatRouterService {
  constructor(
    private readonly financialInsightsService: FinancialInsightsService,
    private readonly analysisChatService: AiAnalysisChatService,
    private readonly savingGoalChatService: AiSavingGoalChatService,
    private readonly transactionChatService: AiTransactionChatService,
    private readonly scenarioWhatIfChatService: AiScenarioWhatIfChatService,
    private readonly budgetRecommendationChatService: AiBudgetRecommendationChatService,
    private readonly goalAchievementChatService: AiGoalAchievementChatService,
  ) {}

  async handle(
    message: string | undefined,
    userId: number,
    ocrText?: string,
    ocrLines?: string,
    goalId?: number,
    forecastedSaving?: number,
  ): Promise<ApiResponse<string>> {
    if (message && message.startsWith('/confirm_saving_goal')) {
      return this.savingGoalChatService.handleConfirmSavingGoal(
        message,
        userId,
      );
    }
    if (message && message.startsWith('/change_saving_goal_duration')) {
      return this.savingGoalChatService.handleChangeSavingGoalDuration(
        message,
        userId,
      );
    }
    if (message && message.startsWith('/saving_goal_init_fund')) {
      return this.savingGoalChatService.handleSavingGoalInitFund(
        message,
        userId,
      );
    }

    if (ocrText) {
      return this.transactionChatService.handleReceiptOcr(
        userId,
        ocrText,
        ocrLines,
      );
    }

    const selectedGoalId =
      (await this.financialInsightsService.getSelectedGoalId(userId)) ?? 0;

    if (
      this.budgetRecommendationChatService.isBudgetRecommendationRequest(
        message ?? '',
      )
    ) {
      return this.budgetRecommendationChatService.handleBudgetRecommendation(
        userId,
      );
    }

    if (this.scenarioWhatIfChatService.isWhatIfRequest(message ?? '')) {
      return this.scenarioWhatIfChatService.handleWhatIf(
        message ?? '',
        userId,
        selectedGoalId,
      );
    }

    if (
      (goalId && goalId > 0) ||
      this.goalAchievementChatService.isGoalAchievementRequest(message ?? '')
    ) {
      return this.goalAchievementChatService.handleGoalAchievementInsight(
        userId,
        message ?? '',
        goalId,
        forecastedSaving,
      );
    }

    if (this.analysisChatService.isAnalysisRequest(message ?? '')) {
      return this.analysisChatService.handleAnalysis(
        message ?? '',
        userId,
        selectedGoalId,
      );
    }

    if (this.savingGoalChatService.isSavingGoalRequest(message ?? '')) {
      return this.savingGoalChatService.handleSavingGoalRequest(
        message ?? '',
        userId,
      );
    }

    if (this.transactionChatService.isGetTransactionRequest(message ?? '')) {
      return this.transactionChatService.handleGetTransactions(
        message ?? '',
        userId,
      );
    }

    return this.transactionChatService.handleRecordOrChat(
      message ?? '',
      userId,
      selectedGoalId,
    );
  }
}
