import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Couple } from './entities/couple.entity';
import { CoupleMember } from './entities/couple-member.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { CouplesController } from './couples.controller';
import { CouplesService } from './couples.service';

import { CoupleSavingGoal } from './entities/couple-saving-goal.entity';
import { CoupleSavingGoalContribution } from './entities/couple-saving-goal-contribution.entity';
import { CoupleSpendingAlert } from './entities/couple-spending-alert.entity';
import { CoupleSavingsController } from './couple-savings.controller';
import { CoupleSavingsService } from './couple-savings.service';
import { CoupleSettlementController } from './couple-settlement.controller';
import { CoupleSettlementService } from './couple-settlement.service';
import { CoupleReportsController } from './couple-reports.controller';
import { CoupleReportsService } from './couple-reports.service';
import { TransactionSplit } from '../transactions/entities/transaction-split.entity';

import { Wallet } from '../wallets/entities/wallet.entity';
import { SpendingPlansModule } from '../spending-plans/spending-plans.module';
import { AiPredictionRun } from 'src/modules/analytics/entities/ai-prediction-run.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Couple,
      CoupleMember,
      User,
      Transaction,
      Category,
      CoupleSavingGoal,
      CoupleSavingGoalContribution,
      CoupleSpendingAlert,
      TransactionSplit,
      Wallet,
      AiPredictionRun,
    ]),
    SpendingPlansModule,
  ],
  controllers: [
    CouplesController,
    CoupleSavingsController,
    CoupleSettlementController,
    CoupleReportsController,
  ],
  providers: [
    CouplesService,
    CoupleSavingsService,
    CoupleSettlementService,
    CoupleReportsService,
  ],
  exports: [
    CouplesService,
    CoupleSavingsService,
    CoupleSettlementService,
    CoupleReportsService,
  ],
})
export class CouplesModule {}
