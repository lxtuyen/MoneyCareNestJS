import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EstimatedExpense } from './entities/estimated-expense.entity';
import { EstimatedExpensesService } from './estimated-expenses.service';
import { EstimatedExpensesController } from './estimated-expenses.controller';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SpendingPlansModule } from 'src/modules/spending-plans/spending-plans.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EstimatedExpense, Category, SubCategory]),
    forwardRef(() => SpendingPlansModule),
  ],
  controllers: [EstimatedExpensesController],
  providers: [EstimatedExpensesService],
  exports: [EstimatedExpensesService, TypeOrmModule],
})
export class EstimatedExpensesModule {}
