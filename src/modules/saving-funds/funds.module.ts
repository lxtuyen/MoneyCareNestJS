import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Fund } from './entities/fund.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { FundsService } from './funds.service';
import { FundsController } from './funds.controller';
import { FundsSchedulerService } from './funds-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Fund, User, Category, Transaction]),
  ],
  controllers: [FundsController],
  providers: [FundsService, FundsSchedulerService],
  exports: [FundsService],
})
export class FundsModule {}
