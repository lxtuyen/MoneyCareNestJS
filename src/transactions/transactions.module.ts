import { forwardRef, Module } from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { TransactionController } from './transactions.controller';
import { UserModule } from 'src/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'src/categories/entities/category.entity';
import { Transaction } from './entities/transaction.entity';
import { User } from 'src/user/entities/user.entity';

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
