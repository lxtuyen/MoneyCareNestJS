import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SpendingPlan } from './entities/spending-plan.entity';
import { FixedExpense } from './entities/fixed-expense.entity';
import { SpendingPlanSnapshot } from './entities/spending-plan-snapshot.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import { SpendingPlansController } from './spending-plans.controller';
import { SpendingPlansService } from './spending-plans.service';
import { SpendingPlanCronService } from './spending-plan-cron.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SpendingPlan,
      FixedExpense,
      SpendingPlanSnapshot,
      Transaction,
      User,
      Category,
      SubCategory,
    ]),
    NotificationsModule,
  ],
  controllers: [SpendingPlansController],
  providers: [SpendingPlansService, SpendingPlanCalculatorService, SpendingPlanCronService],
  exports: [SpendingPlansService, SpendingPlanCalculatorService],
})
export class SpendingPlansModule {}
