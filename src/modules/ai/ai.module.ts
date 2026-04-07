import { Module, Global } from '@nestjs/common';
import { GeminiService } from './gemini.service';
import { ChatbotAiService } from './chatbot-ai.service';
import { ReceiptAiService } from './receipt-ai.service';

@Global()
@Module({
  providers: [GeminiService, ChatbotAiService, ReceiptAiService],
  exports: [GeminiService, ChatbotAiService, ReceiptAiService],
})
export class AiModule {}
