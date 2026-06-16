import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Put,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { SavingGoalsService } from './saving-goals.service';
import { SavingGoalsStatisticsService } from './saving-goals-statistics.service';
import { CreateSavingGoalDto } from './dto/create-goal.dto';
import { UpdateSavingGoalDto } from './dto/update-goal.dto';
import { SavingGoalResponseDto } from './dto/goal-response.dto';
import { ExtendFundDto } from './dto/extend-fund.dto';
import { ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { GoalAchievementPredictionService } from './goal-achievement-prediction.service';
import { ok } from 'src/common/utils/response.util';

@Controller('saving-goals')
@UseGuards(JwtAuthGuard)
export class SavingGoalsController {
  constructor(
    private readonly savingGoalsService: SavingGoalsService,
    private readonly savingGoalsStatisticsService: SavingGoalsStatisticsService,
    private readonly goalAchievementPredictionService: GoalAchievementPredictionService,
  ) {}

  @Post()
  @SwaggerApiResponse({ type: SavingGoalResponseDto })
  create(@User('sub') userId: number, @Body() dto: CreateSavingGoalDto) {
    return this.savingGoalsService.create(dto, userId);
  }

  @Get('user/:userId')
  @SwaggerApiResponse({ type: [SavingGoalResponseDto] })
  findAllByUser(@User('sub') userId: number) {
    return this.savingGoalsService.findAllByUser(userId);
  }

  @Get('predictions')
  async getGoalPredictions(@User('sub') userId: number) {
    const data =
      await this.goalAchievementPredictionService.predictAllGoals(userId);
    return ok(data, 'Lấy dự báo các mục tiêu tiết kiệm thành công');
  }

  @Get(':id')
  @SwaggerApiResponse({ type: SavingGoalResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.savingGoalsService.findOne(id, userId);
  }

  @Patch(':id')
  @SwaggerApiResponse({ type: SavingGoalResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateSavingGoalDto,
  ) {
    return this.savingGoalsService.update(id, dto, userId);
  }

  @Put(':id')
  updatePut(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateSavingGoalDto,
  ) {
    return this.savingGoalsService.update(id, dto, userId);
  }

  @Delete(':id')
  @SwaggerApiResponse({ type: SavingGoalResponseDto })
  remove(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.savingGoalsService.remove(id, userId);
  }

  @Patch('select/:id')
  async selectGoal(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.savingGoalsService.selectGoal(userId, id);
  }

  @Patch(':id/mark-notified')
  async markAsNotified(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.savingGoalsService.markAsNotified(id, userId);
  }

  @Patch(':id/extend')
  async extendGoal(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: ExtendFundDto,
  ) {
    return this.savingGoalsService.extendGoal(
      id,
      new Date(dto.new_end_date),
      dto.new_start_date ? new Date(dto.new_start_date) : undefined,
      userId,
    );
  }



  @Get(':id/report')
  async getGoalReport(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.savingGoalsStatisticsService.getGoalReport(id, userId);
  }

  @Get(':id/prediction')
  async getGoalPrediction(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    // Lấy report để có milestones
    const reportResponse =
      await this.savingGoalsStatisticsService.getGoalReport(id, userId);
    const milestones =
      reportResponse.data?.milestones?.map((m) => ({
        startDate: new Date(m.start_date),
        endDate: new Date(m.end_date),
        target: m.target,
        actual: m.actual,
      })) || [];

    const data = await this.goalAchievementPredictionService.predictGoal(
      userId,
      id,
      milestones,
    );
    return ok(data, 'Lấy dự báo mục tiêu tiết kiệm thành công');
  }
}
