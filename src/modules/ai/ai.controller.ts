import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { ChatDto } from './dto/chat.dto';
import { GoalPlanInsightDto } from './dto/goal-plan-insight.dto';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly receiptOcrService: ReceiptOcrService,
  ) {}

  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    if (!dto?.message && !dto?.ocrText) {
      throw new BadRequestException('Body cần có "message" hoặc "ocrText".');
    }
    if (dto?.userId == null) {
      throw new BadRequestException('userId là bắt buộc.');
    }
    return this.aiService.handle(
      dto.message,
      dto.userId,
      dto.ocrText,
      dto.ocrLines,
      dto.goalId,
      dto.forecastedSaving,
      dto.imagePath,
    );
  }

  @Post('goal-plan-insight')
  async goalPlanInsight(@Body() dto: GoalPlanInsightDto) {
    return this.aiService.generateGoalPlanInsight(dto);
  }

  @Post('receipt/scan')
  @UseInterceptors(FileInterceptor('file'))
  async scanReceipt(@Body() body: Record<string, string | undefined>) {
    return this.receiptOcrService.scanReceipt(body);
  }
}
