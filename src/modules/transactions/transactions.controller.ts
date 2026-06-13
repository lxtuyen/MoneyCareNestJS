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
  UseGuards,
} from '@nestjs/common';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { TransactionService } from './transactions.service';
import { TransactionExportService } from './transactions-export.service';
import { TransactionStatisticsService } from './transactions-statistics.service';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { GetTransactionDto } from './dto/get-transaction.dto';
import { ExportTransactionDto } from './dto/export-transaction.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { TransactionPrivacyService } from './transaction-privacy.service';

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class TransactionController {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly transactionExportService: TransactionExportService,
    private readonly transactionStatisticsService: TransactionStatisticsService,
    private readonly transactionPrivacyService: TransactionPrivacyService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateTransactionDto,
    @User('sub') requestUserId: number,
  ) {
    return this.transactionService.create(dto, requestUserId);
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTransactionDto,
    @User('sub') requestUserId: number,
  ) {
    return this.transactionService.update(id, dto, requestUserId);
  }

  @Get(':userId/total-by-day')
  async getTotalsByDay(
    @Param('userId', ParseIntPipe) userId: number,
    @User('sub') requestUserId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    await this.transactionPrivacyService.ensureCanAccessPersonalTransactions(
      requestUserId,
      userId,
    );
    const dto: GetTransactionDto = {
      userId,
      startDate,
      endDate,
      type,
    };
    return this.transactionStatisticsService.sumByDay(dto);
  }

  @Get(':userId/total-by-type')
  async getTotalsByType(
    @Param('userId', ParseIntPipe) userId: number,
    @User('sub') requestUserId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    await this.transactionPrivacyService.ensureCanAccessPersonalTransactions(
      requestUserId,
      userId,
    );
    const dto: GetTransactionDto = {
      userId,
      startDate,
      endDate,
      type,
    };

    return this.transactionStatisticsService.getTotalsByType(dto);
  }

  @Get(':userId/total-by-category')
  async getTotalsByCate(
    @Param('userId', ParseIntPipe) userId: number,
    @User('sub') requestUserId: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('type') type?: string,
  ) {
    await this.transactionPrivacyService.ensureCanAccessPersonalTransactions(
      requestUserId,
      userId,
    );
    const dto: GetTransactionDto = {
      userId,
      startDate,
      endDate,
      type,
    };
    return this.transactionStatisticsService.sumByCategory(dto);
  }

  @Get(':userId/statistics-summary')
  async getStatisticsSummary(
    @Param('userId', ParseIntPipe) userId: number,
    @User('sub') requestUserId: number,
  ) {
    await this.transactionPrivacyService.ensureCanAccessPersonalTransactions(
      requestUserId,
      userId,
    );
    return this.transactionStatisticsService.getStatisticsSummary(userId);
  }

  @Get(':userId/filter')
  async findAllByFilter(
    @Param('userId', ParseIntPipe) userId: number,
    @User('sub') requestUserId: number,
    @Query('categoryId') categoryId?: any,
    @Query('walletId') walletId?: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: any,
    @Query('coupleId') coupleId?: string,
  ) {
    const cId = coupleId ? Number(coupleId) : undefined;
    if (cId) {
      await this.transactionPrivacyService.ensureCanAccessCouple(
        requestUserId,
        cId,
      );
    } else {
      await this.transactionPrivacyService.ensureCanAccessPersonalTransactions(
        requestUserId,
        userId,
      );
    }

    const dto: TransactionFilterDto = {
      userId: cId ? undefined : userId,
      categoryId:
        categoryId === 'null' || categoryId === 'undefined'
          ? undefined
          : categoryId
            ? Number(categoryId)
            : undefined,
      walletId:
        walletId === 'null' || walletId === 'undefined'
          ? undefined
          : walletId
            ? Number(walletId)
            : undefined,
      startDate,
      endDate,
      limit:
        limit === 'null' || limit === 'undefined'
          ? undefined
          : limit
            ? Number(limit)
            : undefined,
      coupleId: cId,
    };
    return this.transactionService.findAllByFilter(dto, requestUserId);
  }

  @Post(':userId/export')
  async export(
    @Param('userId', ParseIntPipe) userId: number,
    @User('sub') requestUserId: number,
    @Query('format') format: 'pdf' | 'csv' = 'pdf',
    @Body() filter: ExportTransactionDto,
  ) {
    await this.transactionPrivacyService.ensureCanAccessPersonalTransactions(
      requestUserId,
      userId,
    );
    return this.transactionExportService.exportAndSendEmail(
      userId,
      { ...filter, userId },
      format,
    );
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @User('sub') requestUserId: number,
  ) {
    return this.transactionService.remove(id, requestUserId);
  }
}
