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
import { TransactionExportService } from './transactions-export.service';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { GetTransactionDto } from './dto/get-transaction.dto';
import { ExportTransactionDto } from './dto/export-transaction.dto';

@Controller('transactions')
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionExportService: TransactionExportService,
  ) {}

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
    @Query('categoryId') categoryId?: any,
    @Query('walletId') walletId?: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: any,
  ) {
    const dto: TransactionFilterDto = {
      userId,
      categoryId: (categoryId === 'null' || categoryId === 'undefined') ? undefined : (categoryId ? Number(categoryId) : undefined),
      walletId: (walletId === 'null' || walletId === 'undefined') ? undefined : (walletId ? Number(walletId) : undefined),
      startDate,
      endDate,
      limit: (limit === 'null' || limit === 'undefined') ? undefined : (limit ? Number(limit) : undefined),
    };
    return this.transactionService.findAllByFilter(dto);
  }

  @Get(':userId/total-by-day')
  async getTotalsByDay(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      startDate,
      endDate,
      type,
    };
    return this.transactionService.sumByDay(dto);
  }

  @Get(':userId/total-by-type')
  async getTotalsByType(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      startDate,
      endDate,
      type,
    };

    return this.transactionService.getTotalsByType(dto);
  }

  @Get(':userId/total-by-category')
  async getTotalsByCate(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    const dto: GetTransactionDto = {
      userId,
      startDate,
      endDate,
      type,
    };
    return this.transactionService.sumByCategory(dto);
  }

  @Get(':userId/statistics-summary')
  async getStatisticsSummary(
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    return this.transactionService.getStatisticsSummary(userId);
  }

  @Post(':userId/export')
  async export(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('format') format: 'pdf' | 'csv' = 'pdf',
    @Body() filter: ExportTransactionDto,
  ) {
    return this.transactionExportService.exportAndSendEmail(
      userId,
      { ...filter, userId },
      format,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: number) {
    return this.transactionService.remove(id);
  }
}
