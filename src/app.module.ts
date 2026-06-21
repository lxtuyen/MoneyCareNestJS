import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AppCacheModule } from './common/cache/cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UserModule } from './modules/user/user.module';
import { OtpModule } from './modules/otp/otp.module';
import { MailModule } from './modules/mailer/mail.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { SavingGoalsModule } from './modules/saving-goals/saving-goals.module';
import { AiModule } from './modules/ai/ai.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { SpendingPlansModule } from './modules/spending-plans/spending-plans.module';
import { EstimatedExpensesModule } from './modules/estimated-expenses/estimated-expenses.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PersonalizationModule } from './modules/personalization/personalization.module';
import { AiFeedbackModule } from './modules/ai-feedback/ai-feedback.module';
import { ScenarioPlanningModule } from './modules/scenario-planning/scenario-planning.module';
import { CouplesModule } from './modules/couples/couples.module';
import { PaymentsModule } from './modules/payments/payments.module';

@Module({
  imports: [
    AppCacheModule,

    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    ScheduleModule.forRoot(),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const url = configService.get('DATABASE_URL');
        if (url) {
          return {
            type: 'postgres',
            url,
            autoLoadEntities: true,
            synchronize: true,
            logging: false,
          };
        }
        return {
          type: 'postgres',
          host: configService.get('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get('DB_USER'),
          password: configService.get('DB_PASS'),
          database: configService.get('DB_NAME'),
          autoLoadEntities: true,
          synchronize: true,
          logging: false,
        };
      },
      inject: [ConfigService],
    }),

    AuthModule,
    UserProfileModule,
    SavingGoalsModule,
    CategoriesModule,
    TransactionsModule,
    UserModule,
    OtpModule,
    MailModule,
    NotificationsModule,
    GamificationModule,
    AiModule,
    WalletsModule,
    SpendingPlansModule,
    EstimatedExpensesModule,
    AnalyticsModule,
    PersonalizationModule,
    AiFeedbackModule,
    ScenarioPlanningModule,
    CouplesModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
