import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AiService } from './ai.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import { AiVoiceGateway } from './ai-voice.gateway';
import { AiVoiceSessionService } from './ai-voice-session.service';
import { AiChatRouterService } from './ai-chat-router.service';
import { AiSavingGoalChatService } from './ai-saving-goal-chat.service';
import { AiTransactionChatService } from './ai-transaction-chat.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { AiGoalPlanInsightService } from './ai-goal-plan-insight.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { AiController } from './ai.controller';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { FinancialInsightsService } from './financial-insights.service';
import { SpendingPlansModule } from 'src/modules/spending-plans/spending-plans.module';
import { SavingGoalsModule } from 'src/modules/saving-goals/saving-goals.module';
import { WalletsModule } from 'src/modules/wallets/wallets.module';
import { UserCategoryPreference } from 'src/modules/categories/entities/user-category-preference.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      SavingGoal,
      Category,
      SubCategory,
      User,
      Transaction,
      Wallet,
      UserCategoryPreference,
    ]),
    TransactionsModule,
    SpendingPlansModule,
    SavingGoalsModule,
    WalletsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AiController],
  providers: [
    AiService,
    AiGeminiClientService,
    AiVoiceGateway,
    AiVoiceSessionService,
    AiChatRouterService,
    AiSavingGoalChatService,
    AiTransactionChatService,
    AiAnalysisChatService,
    AiGoalPlanInsightService,
    FinancialInsightsService,
    ReceiptOcrService,
  ],
  exports: [AiService, FinancialInsightsService, ReceiptOcrService],
})
export class AiModule {}
