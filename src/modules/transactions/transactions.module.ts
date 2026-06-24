import { forwardRef, Module } from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { TransactionController } from './transactions.controller';
import { UserModule } from 'src/modules/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { Transaction } from './entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { MailModule } from '../mailer/mail.module';
import { TransactionExportService } from './transactions-export.service';
import { SavingGoalsModule } from 'src/modules/saving-goals/saving-goals.module';
import { TransactionStatisticsService } from './transactions-statistics.service';
import { CouplesModule } from '../couples/couples.module';
import { TransactionPrivacyService } from './transaction-privacy.service';
import { TransactionSplit } from './entities/transaction-split.entity';
import { AnalyticsModule } from '../analytics/analytics.module';
import { SubCategoryAssignmentService } from './sub-category-assignment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Category,
      SubCategory,
      User,
      SavingGoal,
      Wallet,
      TransactionSplit,
    ]),
    forwardRef(() => UserModule),
    MailModule,
    SavingGoalsModule,
    CouplesModule,
    forwardRef(() => AnalyticsModule),
  ],
  controllers: [TransactionController],
  providers: [
    TransactionService,
    TransactionExportService,
    TransactionStatisticsService,
    TransactionPrivacyService,
    SubCategoryAssignmentService,
  ],
  exports: [
    TypeOrmModule,
    TransactionService,
    TransactionExportService,
    TransactionStatisticsService,
    TransactionPrivacyService,
    SubCategoryAssignmentService,
  ],
})
export class TransactionsModule {}
