import { Injectable } from '@nestjs/common';
import { AiGeminiReceiptService } from './ai-gemini-receipt.service';
import { ReceiptScanResult } from './receipt.types';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly aiGeminiReceiptService: AiGeminiReceiptService,
  ) {}

  async scan(imageBuffer: Buffer): Promise<ReceiptScanResult> {
    return this.aiGeminiReceiptService.scan(imageBuffer);
  }
}
