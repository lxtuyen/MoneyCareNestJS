import {
  BadRequestException,
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @UseInterceptors(FileInterceptor('file'))
  async chat(
    @Body() dto: ChatDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!dto?.message && !file) {
      throw new BadRequestException('Body cần có "message" hoặc một file ảnh đính kèm.');
    }
    if (dto?.userId == null) {
      throw new BadRequestException('userId là bắt buộc.');
    }
    return this.aiService.handle(dto.message, dto.userId, file, dto.fundId);
  }

  @Post('chat/bulk-save')
  async bulkSave(@Body() body: { userId: number; items: any[]; fundId?: number }) {
    if (!body.userId || !body.items || !Array.isArray(body.items)) {
      throw new BadRequestException('userId và danh sách items là bắt buộc.');
    }
    await this.aiService.bulkCreateTransactions(body.userId, body.items, body.fundId);
    return { success: true, message: 'Đã lưu tất cả giao dịch thành công.' };
  }

  @Post('receipt/scan')
  @UseInterceptors(FileInterceptor('file'))
  async scanReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không nhận được file ảnh');
    }
    if (!file.buffer) {
      throw new BadRequestException('File không hợp lệ');
    }
    return this.aiService.scanReceiptStandalone(file.buffer);
  }

  @Get('insights')
  async getInsights(
    @Query('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId?: number,
    @Query('period') period?: 'this_month' | 'last_30_days',
  ) {
    return this.aiService.getFinancialInsights(userId, fundId, period);
  }
}
