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
import { CreateSavingGoalDto } from './dto/create-goal.dto';
import { UpdateSavingGoalDto } from './dto/update-goal.dto';
import { SavingGoalResponseDto } from './dto/goal-response.dto';
import { ExtendFundDto } from './dto/extend-fund.dto';
import { ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@Controller('saving-goals')
@UseGuards(JwtAuthGuard)
export class SavingGoalsController {
  constructor(private readonly savingGoalsService: SavingGoalsService) {}

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

  @Get('check-expired/:userId')
  async checkExpiredGoal(@User('sub') userId: number) {
    return this.savingGoalsService.checkExpiredGoal(userId);
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
      dto.new_end_date,
      dto.new_start_date,
      userId,
    );
  }

  @Get(':id/report')
  async getGoalReport(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.savingGoalsService.getGoalReport(id, userId);
  }
}
