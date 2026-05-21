import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SpendingPlan } from './entities/spending-plan.entity';
import { EstimatedExpense } from 'src/modules/estimated-expenses/entities/estimated-expense.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import { SpendingPlanStatisticsService } from './spending-plan-statistics.service';
import { SpendingPlansController } from './spending-plans.controller';
import { SpendingPlansService } from './spending-plans.service';
import { EstimatedExpensesModule } from '../estimated-expenses/estimated-expenses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SpendingPlan,
      EstimatedExpense,
      Transaction,
      User,
      Category,
      SubCategory,
    ]),
    forwardRef(() => EstimatedExpensesModule),
  ],
  controllers: [SpendingPlansController],
  providers: [
    SpendingPlansService,
    SpendingPlanCalculatorService,
    SpendingPlanStatisticsService,
  ],
  exports: [
    SpendingPlansService,
    SpendingPlanCalculatorService,
    SpendingPlanStatisticsService,
    TypeOrmModule,
  ],
})
export class SpendingPlansModule {}
