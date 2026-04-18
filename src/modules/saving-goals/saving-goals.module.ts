import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingGoalsService } from './saving-goals.service';
import { SavingGoalsController } from './saving-goals.controller';
import { GoalsSchedulerService } from './goals-scheduler.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingGoal, User, Category, Transaction]),
  ],
  controllers: [SavingGoalsController],
  providers: [SavingGoalsService, GoalsSchedulerService],
  exports: [SavingGoalsService],
})
export class SavingGoalsModule {}
