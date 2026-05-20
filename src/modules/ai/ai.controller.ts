import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';
import { GoalPlanInsightDto } from './dto/goal-plan-insight.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
      undefined,
      dto.ocrText,
      dto.ocrLines,
    );
  }

  @Post('goal-plan-insight')
  async goalPlanInsight(@Body() dto: GoalPlanInsightDto) {
    return this.aiService.generateGoalPlanInsight(dto);
  }

  @Post('receipt/scan')
  @UseInterceptors(FileInterceptor('file'))
  async scanReceipt(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    return this.aiService.scanReceipt(file, body);
  }
}
