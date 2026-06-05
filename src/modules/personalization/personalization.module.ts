import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalFinanceProfile } from './entities/personal-finance-profile.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import { UserCategoryPreference } from 'src/modules/categories/entities/user-category-preference.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { PersonalizationService } from './personalization.service';
import { PersonalizationController } from './personalization.controller';
import { AiFeedbackModule } from 'src/modules/ai-feedback/ai-feedback.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PersonalFinanceProfile,
      Transaction,
      SavingGoal,
      SpendingPlan,
      UserCategoryPreference,
      User,
    ]),
    AiFeedbackModule,
  ],
  controllers: [PersonalizationController],
  providers: [PersonalizationService],
  exports: [PersonalizationService],
})
export class PersonalizationModule {}
