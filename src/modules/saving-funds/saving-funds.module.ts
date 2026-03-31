import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingFund } from './entities/saving-fund.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingFundsService } from './saving-funds.service';
import { SavingFundsController } from './saving-funds.controller';
import { SavingFundsSchedulerService } from './saving-funds-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingFund, User, Category, Transaction]),
  ],
  controllers: [SavingFundsController],
  providers: [SavingFundsService, SavingFundsSchedulerService],
  exports: [SavingFundsService],
})
export class SavingFundsModule {}
