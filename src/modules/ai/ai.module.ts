import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { Fund } from 'src/modules/saving-funds/entities/fund.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { FinancialInsightsService } from './financial-insights.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Fund, Category, User, Transaction]),
    TransactionsModule,
  ],
  controllers: [AiController],
  providers: [AiService, FinancialInsightsService],
  exports: [AiService, FinancialInsightsService],
})
export class AiModule {}
