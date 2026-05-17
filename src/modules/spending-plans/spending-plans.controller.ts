import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { CreateSpendingPlanDto } from './dto/create-spending-plan.dto';
import { CloneSpendingPlanDto } from './dto/clone-spending-plan.dto';
import { MarkFixedExpensePaidDto } from './dto/mark-fixed-expense-paid.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';
import { UpdateSpendingPlanDto } from './dto/update-spending-plan.dto';
import { SpendingPlanStatus } from './entities/spending-plan.enums';
import { SpendingPlansService } from './spending-plans.service';

@Controller('spending-plans')
@UseGuards(JwtAuthGuard)
export class SpendingPlansController {
  constructor(private readonly spendingPlansService: SpendingPlansService) {}

  @Get()
  findAll(
    @User('sub') userId: number,
    @Query('month') month?: number,
    @Query('year') year?: number,
    @Query('status') status?: SpendingPlanStatus,
  ) {
    return this.spendingPlansService.findAll(userId, { month, year, status });
  }

  @Get('active')
  findActive(@User('sub') userId: number) {
    return this.spendingPlansService.findActive(userId);
  }

  @Get('active/home-summary')
  getHomeSummary(@User('sub') userId: number) {
    return this.spendingPlansService.getActiveHomeSummary(userId);
  }

  @Get('active/statistics')
  getStatistics(@User('sub') userId: number) {
    return this.spendingPlansService.getActiveStatistics(userId);
  }

  @Post()
  create(@User('sub') userId: number, @Body() dto: CreateSpendingPlanDto) {
    return this.spendingPlansService.create(userId, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: UpdateSpendingPlanDto,
  ) {
    return this.spendingPlansService.update(id, userId, dto);
  }

  @Patch(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.activate(id, userId);
  }

  @Patch(':id/archive')
  archive(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.archive(id, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @User('sub') userId: number) {
    return this.spendingPlansService.remove(id, userId);
  }

  @Post(':id/clone')
  clone(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: CloneSpendingPlanDto,
  ) {
    return this.spendingPlansService.clone(id, userId, dto);
  }

  @Get(':id/fixed-expenses')
  findFixedExpenses(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
  ) {
    return this.spendingPlansService.findFixedExpenses(id, userId);
  }

  @Post(':id/fixed-expenses')
  createFixedExpense(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') userId: number,
    @Body() dto: CreateFixedExpenseDto,
  ) {
    return this.spendingPlansService.createFixedExpense(id, userId, dto);
  }

  @Patch(':planId/fixed-expenses/:expenseId')
  updateFixedExpense(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @User('sub') userId: number,
    @Body() dto: UpdateFixedExpenseDto,
  ) {
    return this.spendingPlansService.updateFixedExpense(
      planId,
      expenseId,
      userId,
      dto,
    );
  }

  @Delete(':planId/fixed-expenses/:expenseId')
  deleteFixedExpense(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @User('sub') userId: number,
  ) {
    return this.spendingPlansService.deleteFixedExpense(
      planId,
      expenseId,
      userId,
    );
  }

  @Patch(':planId/fixed-expenses/:expenseId/mark-paid')
  markFixedExpensePaid(
    @Param('planId', ParseIntPipe) planId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @User('sub') userId: number,
    @Body() dto: MarkFixedExpensePaidDto,
  ) {
    return this.spendingPlansService.markFixedExpensePaid(
      planId,
      expenseId,
      userId,
      dto,
    );
  }
}
