import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';
import { ok } from 'src/common/utils/response.util';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly evaluationService: AnalyticsEvaluationService,
  ) {}

  @Get('financial-summary')
  async getFinancialSummary(@User('sub') userId: number) {
    return this.analyticsService.getFinancialSummary(userId);
  }

  @Get('model-evaluation')
  async getModelEvaluation(@User('sub') userId: number) {
    const data = await this.evaluationService.getModelEvaluationSummary(userId);
    return ok(data, 'Lấy tổng hợp đánh giá mô hình thành công');
  }

  @Get('model-evaluation/forecasting')
  async getForecastingEvaluation(@User('sub') userId: number) {
    const data = await this.evaluationService.getForecastingEvaluation(userId);
    return ok(data, 'Lấy chi tiết đánh giá dự báo thành công');
  }

  @Get('model-evaluation/budgeting')
  async getBudgetingEvaluation(@User('sub') userId: number) {
    const data = await this.evaluationService.getBudgetingEvaluation(userId);
    return ok(data, 'Lấy chi tiết đánh giá ngân sách thành công');
  }

  @Post('model-evaluation/run')
  async runEvaluation(
    @User('sub') userId: number,
    @Body() body: { modelType?: string },
  ) {
    const count = await this.evaluationService.evaluateDuePredictions(userId, body.modelType);
    return ok({ evaluatedCount: count }, `Đã đánh giá ${count} dự đoán`);
  }
}
