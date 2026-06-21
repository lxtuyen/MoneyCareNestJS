import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Couple } from '../couples/entities/couple.entity';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { SpendingPlan } from '../spending-plans/entities/spending-plan.entity';
import { SpendingPlansModule } from '../spending-plans/spending-plans.module';
import { PersonalizationModule } from '../personalization/personalization.module';
import { AiFeedbackModule } from '../ai-feedback/ai-feedback.module';
import { SavingGoalsModule } from '../saving-goals/saving-goals.module';
import { AiPredictionRun } from './entities/ai-prediction-run.entity';
import { AiPredictionEvaluation } from './entities/ai-prediction-evaluation.entity';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPredictionService } from './analytics-prediction.service';
import { AnalyticsEvaluationService } from './analytics-evaluation.service';
import { AnalyticsEvaluationScheduler } from './analytics-evaluation.scheduler';
import { AnalyticsModelTrainingService } from './analytics-model-training.service';
import { AnalyticsPayloadBuilderService } from './analytics-payload-builder.service';
import { AnalyticsServiceClient } from './analytics-service-client.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Couple,
      SavingGoal,
      SpendingPlan,
      AiPredictionRun,
      AiPredictionEvaluation,
    ]),
    SpendingPlansModule,
    PersonalizationModule,
    AiFeedbackModule,
    forwardRef(() => SavingGoalsModule),
    ConfigModule,
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsPredictionService,
    AnalyticsEvaluationService,
    AnalyticsEvaluationScheduler,
    AnalyticsModelTrainingService,
    AnalyticsPayloadBuilderService,
    AnalyticsServiceClient,
  ],
  exports: [AnalyticsService, AnalyticsPredictionService],
})
export class AnalyticsModule {}
