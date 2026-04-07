import {
  ChatExpenseResult,
  CatOption,
  FinancialAnalysisResult,
} from '../types/chatbot.types';

export interface AiProvider {
  parseExpense(
    text: string,
    categories: CatOption[],
  ): Promise<ChatExpenseResult>;
  analyzeFinancialHealth(
    text: string,
    categories: CatOption[],
    historyData: string,
    userName: string,
  ): Promise<FinancialAnalysisResult | string>;
  chatAnswer(text: string): Promise<string>;
}
