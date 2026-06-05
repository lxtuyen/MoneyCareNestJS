import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { CreateAiFeedbackDto } from './dto/create-ai-feedback.dto';
import type { AiRecommendationType } from './entities/ai-recommendation-feedback.entity';
import { AiFeedbackService } from './ai-feedback.service';

@Controller('ai-feedback')
@UseGuards(JwtAuthGuard)
export class AiFeedbackController {
  constructor(private readonly aiFeedbackService: AiFeedbackService) {}

  @Post()
  async createFeedback(
    @User('sub') userId: number,
    @Body() dto: CreateAiFeedbackDto,
  ) {
    const feedback = await this.aiFeedbackService.create(userId, dto);
    return ok({ id: feedback.id }, 'Da ghi nhan phan hoi AI');
  }

  @Get('summary')
  async getSummary(
    @User('sub') userId: number,
    @Query('type') type?: string,
    @Query('period') period?: string,
  ) {
    const summary = await this.aiFeedbackService.getSummary(
      userId,
      type as AiRecommendationType | undefined,
      period,
    );
    return ok(summary, 'Lay tong hop phan hoi AI thanh cong');
  }

  @Get('recent')
  async getRecent(@User('sub') userId: number, @Query('limit') limit?: number) {
    const items = await this.aiFeedbackService.getRecent(userId, limit);
    return ok({ items }, 'Lay phan hoi AI gan day thanh cong');
  }
}
