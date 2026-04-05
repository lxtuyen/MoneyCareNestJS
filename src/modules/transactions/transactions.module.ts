import { forwardRef, Module } from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { TransactionController } from './transactions.controller';
import { UserModule } from 'src/modules/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from './entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Fund } from 'src/modules/saving-funds/entities/fund.entity';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, User, Fund]),
    forwardRef(() => UserModule),
    NotificationsModule,
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TypeOrmModule, TransactionService],
})
export class TransactionsModule {}
