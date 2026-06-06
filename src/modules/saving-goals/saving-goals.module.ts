import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { SavingGoalsService } from './saving-goals.service';
import { SavingGoalsStatisticsService } from './saving-goals-statistics.service';
import { SavingGoalsController } from './saving-goals.controller';
import { GoalsSchedulerService } from './goals-scheduler.service';
import { SpendingPlansModule } from 'src/modules/spending-plans/spending-plans.module';
import { PersonalizationModule } from 'src/modules/personalization/personalization.module';
import { GoalAchievementPredictionService } from './goal-achievement-prediction.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingGoal, User, Transaction, Wallet]),
    SpendingPlansModule,
    PersonalizationModule,
  ],
  controllers: [SavingGoalsController],
  providers: [
    SavingGoalsService,
    SavingGoalsStatisticsService,
    GoalsSchedulerService,
    GoalAchievementPredictionService,
  ],
  exports: [
    SavingGoalsService,
    SavingGoalsStatisticsService,
    GoalAchievementPredictionService,
  ],
})
export class SavingGoalsModule {}
