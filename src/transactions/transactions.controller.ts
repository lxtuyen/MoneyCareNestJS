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
  ) {
    const dto: GetTransactionDto = {
      userId,
      fundId,
      startDate,
      endDate,
    };
    return this.transactionService.sumByDay(dto);
  }

  @Get(':userId/total-by-type')
  async getTotalsByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId: number,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      fundId,
      startDate,
      endDate,
    };

    return this.transactionService.getTotalsByType(dto);
  }

  @Get(':userId/total-by-category')
  async getTotalsByCate(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('fundId') fundId: number,
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      fundId,
      startDate,
      endDate,
    };
    return this.transactionService.sumByCategory(dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.transactionService.remove(id);
  }
}
