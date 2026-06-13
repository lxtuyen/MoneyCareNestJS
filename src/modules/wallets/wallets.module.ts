import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletsService } from './wallets.service';
import { WalletsController } from './wallets.controller';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { CoupleSavingGoal } from '../couples/entities/couple-saving-goal.entity';
import { CoupleSavingGoalContribution } from '../couples/entities/couple-saving-goal-contribution.entity';
import { CouplesModule } from '../couples/couples.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      Transaction,
      Category,
      SavingGoal,
      CoupleSavingGoal,
      CoupleSavingGoalContribution,
    ]),
    CouplesModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
