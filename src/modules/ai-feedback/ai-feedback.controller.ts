import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { CreateAiFeedbackDto } from './dto/create-ai-feedback.dto';
import { UpdateAiFeedbackOutcomeDto } from './dto/update-ai-feedback-outcome.dto';
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

  @Post(':id/outcome')
  async recordOutcome(
    @User('sub') userId: number,
    @Param('id') id: string,
    @Body() dto: UpdateAiFeedbackOutcomeDto,
  ) {
    const feedback = await this.aiFeedbackService.recordOutcome(
      userId,
      Number(id),
      dto.outcomePayload,
    );
    return ok({ id: feedback.id }, 'Da ghi nhan ket qua phan hoi AI');
  }

  @Get('budgeting-readiness')
  async getBudgetingReadiness(
    @User('sub') userId: number,
    @Query('scope') scope?: string,
    @Query('includeSynthetic') includeSynthetic?: string,
  ) {
    const data = await this.aiFeedbackService.getBudgetingReadiness(
      userId,
      scope === 'global' ? 'global' : 'user',
      includeSynthetic === 'true',
    );
    return ok(data, 'Lay readiness feedback budgeting thanh cong');
  }
}
