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
import { PaymentsModule } from './modules/payment/payment.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { FinanceModeModule } from './modules/finance-mode/finance-mode.module';
import { GamificationModule } from './modules/gamification/gamification.module';
import { SavingGoalsModule } from './modules/saving-goals/saving-goals.module';
import { AiModule } from './modules/ai/ai.module';

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
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get('DB_USER'),
        password: configService.get('DB_PASS'),
        database: configService.get('DB_NAME'),
        autoLoadEntities: true,
        synchronize: true,
      }),
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
    PaymentsModule,
    NotificationsModule,
    FinanceModeModule,
    GamificationModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
