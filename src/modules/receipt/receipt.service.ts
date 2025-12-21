import { HttpStatus, Injectable } from '@nestjs/common';
import { AiGeminiReceiptService } from '../ai/ai-gemini-receipt.service';
import { ReceiptScanResult } from 'src/common/interfaces/receipt.interface';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly aiGeminiReceiptService: AiGeminiReceiptService,
  ) {}

  async scan(imageBuffer: Buffer): Promise<ApiResponse<ReceiptScanResult>> {
    const data = await this.aiGeminiReceiptService.scan(imageBuffer);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: data,
      message: 'Cập nhật thành công',
    });
  }
}
