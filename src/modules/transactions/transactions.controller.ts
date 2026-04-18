import {
  Controller,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Get,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transactions.service';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { GetTransactionDto } from './dto/get-transaction.dto';

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  async create(@Body() dto: CreateTransactionDto) {
    return this.transactionService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: number, @Body() dto: UpdateTransactionDto) {
    return this.transactionService.update(id, dto);
  }

  @Get('filter/:userId')
  async findAllByFilter(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('savingGoalId') savingGoalId?: any,
    @Query('categoryId') categoryId?: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const dto: TransactionFilterDto = {
      userId,
      categoryId: (categoryId === 'null' || categoryId === 'undefined') ? undefined : (categoryId ? Number(categoryId) : undefined),
      savingGoalId: (savingGoalId === 'null' || savingGoalId === 'undefined') ? undefined : (savingGoalId ? Number(savingGoalId) : undefined),
      startDate,
      endDate,
    };
    return this.transactionService.findAllByFilter(dto);
  }

  @Get(':userId/total-by-day')
  async getTotalsByDay(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('savingGoalId') savingGoalId?: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      savingGoalId: (savingGoalId === 'null' || savingGoalId === 'undefined') ? undefined : (savingGoalId ? Number(savingGoalId) : undefined),
      startDate,
      endDate,
      type,
    };
    return this.transactionService.sumByDay(dto);
  }

  @Get(':userId/total-by-type')
  async getTotalsByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('savingGoalId') savingGoalId?: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      savingGoalId: (savingGoalId === 'null' || savingGoalId === 'undefined') ? undefined : (savingGoalId ? Number(savingGoalId) : undefined),
      startDate,
      endDate,
      type,
    };

    return this.transactionService.getTotalsByType(dto);
  }

  @Get(':userId/total-by-category')
  async getTotalsByCate(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('savingGoalId') savingGoalId?: any,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      savingGoalId: (savingGoalId === 'null' || savingGoalId === 'undefined') ? undefined : (savingGoalId ? Number(savingGoalId) : undefined),
      startDate,
      endDate,
      type,
    };
    return this.transactionService.sumByCategory(dto);
  }

  @Get(':userId/statistics-summary')
  async getStatisticsSummary(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('savingGoalId') savingGoalId?: any,
  ) {
    const resolvedSavingGoalId = (savingGoalId === 'null' || savingGoalId === 'undefined') ? undefined : (savingGoalId ? Number(savingGoalId) : undefined);
    return this.transactionService.getStatisticsSummary(userId, resolvedSavingGoalId);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.transactionService.remove(id);
  }
}
