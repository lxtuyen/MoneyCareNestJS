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

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  async create(@Body() dto: CreateTransactionDto) {
    if (dto.type === 'income' && !dto.categoryId) {
      dto.categoryId = undefined;
    }

    if (dto.type === 'expense' && !dto.categoryId) {
      throw new Error('Expense transaction must have a categoryId');
    }

    return this.transactionService.create(dto);
  }

  @Put(':id')
  async update(@Param('id') id: number, @Body() dto: UpdateTransactionDto) {
    if (dto.type === 'income' && !dto.categoryId) {
      dto.categoryId = undefined;
    }

    if (dto.type === 'expense' && !dto.categoryId) {
      throw new Error('Expense transaction must have a categoryId');
    }

    return this.transactionService.update(id, dto);
  }

  @Get()
  async findAll(@Query() filter: TransactionFilterDto) {
    return this.transactionService.findAllByFilter(filter);
  }

  @Get(':id')
  async findById(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.findById(id);
  }

  @Get('me/:userId')
  async findAllByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: number,
  ) {
    return this.transactionService.findAllByUser(userId, limit);
  }

  @Get(':userId/total-by-type')
  async getTotalsByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    return this.transactionService.getTotalsByType(
      userId,
      start_date,
      end_date,
    );
  }

  @Get(':userId/total-by-category')
  async getTotalsByCate(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('start_date') start_date?: string,
    @Query('end_date') end_date?: string,
  ) {
    return this.transactionService.sumByCategory(userId, start_date, end_date);
  }

  @Get('latest-per-type/:userId')
  async getLatest4ByType(@Param('userId', ParseIntPipe) userId: number) {
    return this.transactionService.findLatest4ByTypePerUser(userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.transactionService.remove(id);
  }
}
