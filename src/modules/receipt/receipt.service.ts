import { HttpStatus, Injectable } from '@nestjs/common';
import { ReceiptAiService } from '../ai/receipt-ai.service';
import { ReceiptScanResult } from './types/receipt.types';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class ReceiptService {
  constructor(
    private readonly receiptAi: ReceiptAiService,
  ) {}

  async scan(imageBuffer: Buffer): Promise<ApiResponse<ReceiptScanResult>> {
    const data = await this.receiptAi.scan(imageBuffer);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: data,
      message: 'Cập nhật thành công',
    });
  }
}
