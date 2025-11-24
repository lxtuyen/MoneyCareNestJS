import { Module } from '@nestjs/common';
import { ReceiptController } from './receipt.controller';
import { ReceiptService } from './receipt.service';
import { AiGeminiReceiptService } from './ai-gemini-receipt.service';

@Module({
  imports: [],
  controllers: [ReceiptController],
  providers: [ReceiptService, AiGeminiReceiptService],
  exports: [ReceiptService],
})
export class ReceiptModule {}
