import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';
import { AnalyticsModelTrainingService } from './analytics-model-training.service';
import { ok } from 'src/common/utils/response.util';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly evaluationService: AnalyticsEvaluationService,
    private readonly modelTrainingService: AnalyticsModelTrainingService,
  ) {}

  @Get('financial-summary')
  async getFinancialSummary(
    @User('sub') userId: number,
    @Query('targetMonth') targetMonth?: string,
    @Query('targetYear') targetYear?: string,
  ) {
    return this.analyticsService.getFinancialSummary(userId, {
      targetMonth: targetMonth ? Number(targetMonth) : undefined,
      targetYear: targetYear ? Number(targetYear) : undefined,
    });
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
    const count = await this.evaluationService.evaluateDuePredictions(
      userId,
      body.modelType,
    );
    return ok({ evaluatedCount: count }, `Đã đánh giá ${count} dự đoán`);
  }

  @Post('model-training/forecasting')
  async trainForecastingModel(@User('sub') userId: number) {
    this.logger.log(
      `Received forecasting training request for userId=${userId}`,
    );
    const data = await this.modelTrainingService.trainForecastingModel(userId);
    this.logger.log(
      `Forecasting training finished for userId=${userId}, status=${data.status}, artifactSaved=${data.artifactSaved}`,
    );
    return ok(data, 'Yêu cầu huấn luyện mô hình dự báo thành công');
  }
}
