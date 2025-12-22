import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { UserProfileModule } from './modules/user-profile/user-profile.module';
import { SavingFundsModule } from './modules/saving-funds/saving-funds.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { UserModule } from './modules/user/user.module';
import { OtpModule } from './modules/otp/otp.module';
import { MailModule } from './modules/mailer/mail.module';
import { ReceiptModule } from './modules/receipt/receipt.module';
import { EmailTransferModule } from './modules/email-transfer/email-transfer.module';
import { GmailModule } from './modules/gmail/gmail.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PendingTransactionModule } from './modules/pending-transaction/pending-transaction.module';
import { ChatbotModule } from './modules/chatbot/chatbot.module';
import { PaymentsModule } from './modules/payment/payment.module';

@Module({
  imports: [
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
    ReceiptModule,

    UserProfileModule,

    SavingFundsModule,

    CategoriesModule,

    TransactionsModule,

    UserModule,

    OtpModule,

    MailModule,

    EmailTransferModule,

    GmailModule,

    PendingTransactionModule,

    PaymentsModule,

    ChatbotModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
