import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { FinancialInsightsService } from './financial-insights.service';
import { SpendingPlansModule } from 'src/modules/spending-plans/spending-plans.module';
import { SavingGoalsModule } from 'src/modules/saving-goals/saving-goals.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([SavingGoal, Category, User, Transaction, Wallet]),
    TransactionsModule,
    SpendingPlansModule,
    SavingGoalsModule,
  ],
  controllers: [AiController],
  providers: [AiService, FinancialInsightsService],
  exports: [AiService, FinancialInsightsService],
})
export class AiModule {}
