import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { RecurringTransactionsService } from './recurring-transactions.service';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';

@Controller('recurring-transactions')
export class RecurringTransactionsController {
  constructor(private readonly recurringService: RecurringTransactionsService) {}

  @Post()
  create(@Body() dto: CreateRecurringTransactionDto) {
    return this.recurringService.create(dto);
  }

  @Get('user/:userId')
  findAllByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.recurringService.findAllByUser(userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.recurringService.remove(id);
  }

  @Post('trigger-manual')
  triggerManual() {
    return this.recurringService.handleRecurringTransactions();
  }
}
