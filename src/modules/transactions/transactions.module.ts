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
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { MailModule } from '../mailer/mail.module';
import { TransactionExportService } from './transactions-export.service';
import { SavingGoalsModule } from 'src/modules/saving-goals/saving-goals.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, SubCategory, User, SavingGoal, Wallet]),
    forwardRef(() => UserModule),
    NotificationsModule,
    MailModule,
    SavingGoalsModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionExportService],
  exports: [TypeOrmModule, TransactionService, TransactionExportService],
})
export class TransactionsModule {}
