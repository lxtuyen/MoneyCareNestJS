import { forwardRef, Module } from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { TransactionController } from './transactions.controller';
import { UserModule } from 'src/modules/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from './entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { MailModule } from '../mailer/mail.module';
import { TransactionExportService } from './transactions-export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, User, SavingGoal]),
    forwardRef(() => UserModule),
    NotificationsModule,
    MailModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService, TransactionExportService],
  exports: [TypeOrmModule, TransactionService, TransactionExportService],
})
export class TransactionsModule {}
