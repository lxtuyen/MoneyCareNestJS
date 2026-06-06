import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { PersonalizationModule } from 'src/modules/personalization/personalization.module';
import { SpendingPlansModule } from 'src/modules/spending-plans/spending-plans.module';
import { SavingGoalsModule } from 'src/modules/saving-goals/saving-goals.module';
import { ScenarioSimulation } from './entities/scenario-simulation.entity';
import { ScenarioPlanningController } from './scenario-planning.controller';
import { ScenarioPlanningService } from './scenario-planning.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScenarioSimulation, Transaction]),
    PersonalizationModule,
    SpendingPlansModule,
    SavingGoalsModule,
  ],
  controllers: [ScenarioPlanningController],
  providers: [ScenarioPlanningService],
  exports: [ScenarioPlanningService],
})
export class ScenarioPlanningModule {}
