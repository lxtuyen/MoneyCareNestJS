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
import { FundsService } from './funds.service';
import { CreateFundDto } from './dto/create-fund.dto';
import { UpdateFundDto } from './dto/update-fund.dto';
import { FundResponseDto } from './dto/fund-response.dto';
import { ExtendFundDto } from './dto/extend-fund.dto';
import { ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@Controller('funds')
@UseGuards(JwtAuthGuard)
export class FundsController {
  constructor(private readonly fundsService: FundsService) {}

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  @Post()
  @SwaggerApiResponse({ type: FundResponseDto })
  create(@User('sub') userId: number, @Body() dto: CreateFundDto) {
    return this.fundsService.create(dto, userId);
  }

  @Get('user/:userId')
  @SwaggerApiResponse({ type: [FundResponseDto] })
  findAllByUser(@User('sub') userId: number) {
    return this.fundsService.findAllByUser(userId);
  }

  /** GET /fund/user/:userId/spending — list SPENDING funds only */
  @Get('user/:userId/spending')
  findSpendingFunds(@User('sub') userId: number) {
    return this.fundsService.findSpendingFunds(userId);
  }

  /** GET /fund/user/:userId/goals — list SAVING_GOAL funds only */
  @Get('user/:userId/goals')
  findGoalFunds(@User('sub') userId: number) {
    return this.fundsService.findGoalFunds(userId);
  }

  @Get(':id')
  @SwaggerApiResponse({ type: FundResponseDto })
  findOne(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.fundsService.findOne(id, userId);
  }

  @Patch(':id')
  @SwaggerApiResponse({ type: FundResponseDto })
  update(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateFundDto,
  ) {
    return this.fundsService.update(id, dto, userId);
  }

  /** PUT mirrors PATCH for compatibility with GoalFund's PUT convention. */
  @Put(':id')
  updatePut(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateFundDto,
  ) {
    return this.fundsService.update(id, dto, userId);
  }

  @Delete(':id')
  @SwaggerApiResponse({ type: FundResponseDto })
  remove(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.fundsService.remove(id, userId);
  }

  @Patch('select/:fundId')
  async selectFund(
    @Param('fundId', ParseIntPipe) fundId: number,
    @User('sub') userId: number,
  ) {
    return this.fundsService.selectFund(userId, fundId);
  }

  // ── Expired fund handling ────────────────────────────────────────────────────

  @Get('check-expired/:userId')
  async checkExpiredFund(@User('sub') userId: number) {
    return this.fundsService.checkExpiredFund(userId);
  }

  @Patch(':fundId/mark-notified')
  async markAsNotified(
    @Param('fundId', ParseIntPipe) fundId: number,
    @User('sub') userId: number,
  ) {
    return this.fundsService.markAsNotified(fundId, userId);
  }

  @Patch(':fundId/extend')
  async extendFund(
    @Param('fundId', ParseIntPipe) fundId: number,
    @User('sub') userId: number,
    @Body() dto: ExtendFundDto,
  ) {
    return this.fundsService.extendFund(
      fundId,
      dto.new_end_date,
      dto.new_start_date,
      userId,
    );
  }

  @Get(':fundId/report')
  async getFundReport(
    @Param('fundId', ParseIntPipe) fundId: number,
    @User('sub') userId: number,
  ) {
    return this.fundsService.getFundReport(fundId, userId);
  }

  // ── Goal-fund compatibility endpoints (JWT-guarded) ──────────────────────────
  // These mirror the old /goal-fund routes so Flutter code can transition smoothly.

  @Get('goals/me')
  findMyGoals(@User('sub') userId: number) {
    return this.fundsService.findGoalFunds(userId);
  }

  @Get('goals/:id')
  findOneGoal(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.fundsService.findOne(id, userId);
  }
}
