import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
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

import { CoupleMessage } from './entities/couple-message.entity';
import { CoupleChatService } from './couple-chat.service';
import { CoupleChatController } from './couple-chat.controller';
import { CoupleChatGateway } from './couple-chat.gateway';
import { CloudinaryService } from './cloudinary.service';

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
      CoupleMessage,
    ]),
    SpendingPlansModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    CouplesController,
    CoupleSavingsController,
    CoupleSettlementController,
    CoupleReportsController,
    CoupleChatController,
  ],
  providers: [
    CouplesService,
    CoupleSavingsService,
    CoupleSettlementService,
    CoupleReportsService,
    CoupleChatService,
    CoupleChatGateway,
    CloudinaryService,
  ],
  exports: [
    CouplesService,
    CoupleSavingsService,
    CoupleSettlementService,
    CoupleReportsService,
    CoupleChatService,
    CloudinaryService,
  ],
})
export class CouplesModule {}
