import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Couple } from './entities/couple.entity';
import { CoupleMember } from './entities/couple-member.entity';
import { CoupleBudget } from './entities/couple-budget.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { CouplesController } from './couples.controller';
import { CouplesService } from './couples.service';
import { CoupleBudgetsController } from './couple-budgets.controller';
import { CoupleBudgetsService } from './couple-budgets.service';

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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Couple,
      CoupleMember,
      User,
      CoupleBudget,
      Transaction,
      Category,
      CoupleSavingGoal,
      CoupleSavingGoalContribution,
      CoupleSpendingAlert,
      TransactionSplit,
      Wallet,
    ]),
  ],
  controllers: [
    CouplesController,
    CoupleBudgetsController,
    CoupleSavingsController,
    CoupleSettlementController,
    CoupleReportsController,
  ],
  providers: [
    CouplesService,
    CoupleBudgetsService,
    CoupleSavingsService,
    CoupleSettlementService,
    CoupleReportsService,
  ],
  exports: [
    CouplesService,
    CoupleBudgetsService,
    CoupleSavingsService,
    CoupleSettlementService,
    CoupleReportsService,
  ],
})
export class CouplesModule {}
