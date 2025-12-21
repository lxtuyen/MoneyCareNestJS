import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GmailService } from './gmail.service';
import { GmailProcessorService } from './gmail-processor.service';
import { GmailToken } from './entities/gmail-token.entity';
import { ProcessedEmail } from './entities/processed-email.entity';
import { User } from '../user/entities/user.entity';
import { PendingTransactionModule } from '../pending-transaction/pending-transaction.module';
import { GmailCronService } from './gmail-cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GmailToken, ProcessedEmail, User]),

    PendingTransactionModule,
  ],
  providers: [GmailService, GmailProcessorService, GmailCronService],
})
export class GmailModule {}
