import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { SpendingInsightsController } from './spending-insights.controller';
import { SpendingInsightsService } from './spending-insights.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, RecurringTransaction]),
    ConfigModule,
  ],
  controllers: [SpendingInsightsController],
  providers: [SpendingInsightsService],
  exports: [SpendingInsightsService],
})
export class SpendingInsightsModule {}
