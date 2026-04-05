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
    @Query('fundId') fundId: number,
    @Query('categoryId') categoryId?: number,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const dto: TransactionFilterDto = {
      userId,
      categoryId,
      fundId,
      startDate,
      endDate,
    };
    return this.transactionService.findAllByFilter(dto);
  }

  @Get(':userId/total-by-day')
  async getTotalsByDay(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId: number,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      fundId,
      startDate,
      endDate,
      type,
    };
    return this.transactionService.sumByDay(dto);
  }

  @Get(':userId/total-by-type')
  async getTotalsByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId: number,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      fundId,
      startDate,
      endDate,
      type,
    };

    return this.transactionService.getTotalsByType(dto);
  }

  @Get(':userId/total-by-category')
  async getTotalsByCate(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId: number,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      fundId,
      startDate,
      endDate,
      type,
    };
    return this.transactionService.sumByCategory(dto);
  }

  @Get(':userId/statistics-summary')
  async getStatisticsSummary(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId?: number,
  ) {
    return this.transactionService.getStatisticsSummary(userId, fundId);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.transactionService.remove(id);
  }
}
