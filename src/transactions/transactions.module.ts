import { forwardRef, Module } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { UserModule } from 'src/user/user.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from 'src/categories/entities/category.entity';
import { Transaction } from './entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Category]),
    forwardRef(() => UserModule),
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
  exports: [TypeOrmModule],
})
export class TransactionsModule {}
