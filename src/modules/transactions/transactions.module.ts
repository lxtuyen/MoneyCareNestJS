import { forwardRef, Module } from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { TransactionController } from './transactions.controller';
import { UserModule } from 'src/modules/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from './entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category, User]),
    forwardRef(() => UserModule),
  ],
  controllers: [TransactionController],
  providers: [TransactionService],
  exports: [TypeOrmModule],
})
export class TransactionsModule {}
