import { Injectable } from '@nestjs/common';
import { GmailToken } from './entities/gmail-token.entity';
import { GmailService } from './gmail.service';
import { VCBEmailParser } from './parsers/vcb-email.parser';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmailProvider,
  ProcessedEmail,
} from './entities/processed-email.entity';
import { PendingTransactionService } from '../pending-transaction/pending-transaction.service';
import { User } from '../user/entities/user.entity';

@Injectable()
export class GmailProcessorService {
  constructor(
    private readonly gmailService: GmailService,
    @InjectRepository(GmailToken)
    private readonly gmailTokenRepo: Repository<GmailToken>,
    @InjectRepository(ProcessedEmail)
    private readonly processedEmailRepo: Repository<ProcessedEmail>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly pendingTransactionService: PendingTransactionService,
  ) {}

  async processVCBEmails(gmailToken: GmailToken) {
    let accessToken = gmailToken.accessToken;

    if (gmailToken.expiresAt < new Date()) {
      if (!gmailToken.refreshToken) return;

      const refreshed = await this.gmailService.refreshAccessToken(
        gmailToken.refreshToken,
      );

      accessToken = refreshed.accessToken;
      gmailToken.accessToken = refreshed.accessToken;
      gmailToken.expiresAt = refreshed.expiresAt;

      await this.gmailTokenRepo.save(gmailToken);
    }

    const messages = await this.gmailService.listVCBMessages(accessToken);

    for (const msg of messages) {
      const existed = await this.processedEmailRepo.findOne({
        where: {
          gmailMessageId: msg.id,
          provider: EmailProvider.VCB,
        },
      });

      if (existed) continue;

      const detail = await this.gmailService.getMessage(accessToken, msg.id);
      const text = this.gmailService.decodeBody(detail.payload);

      const transaction = VCBEmailParser.parse(text);
      console.log(transaction);
      if (!transaction) continue;

      await this.pendingTransactionService.createIfNotExists({
        userId: gmailToken.user.id,
        gmailMessageId: msg.id,
        provider: 'VCB',

        amount: Math.abs(transaction.amount),
        currency: 'VND',
        transactionTime: transaction.transactionTime,
        direction: 'OUT',

        senderName: transaction.senderName,
        senderAccount: transaction.senderAccount,
        receiverName: transaction.receiverName,
        receiverAccount: transaction.receiverAccount,
        description: transaction.description,
        orderNumber: transaction.orderNumber || undefined,
      });

      const processed = this.processedEmailRepo.create({
        gmailMessageId: msg.id,
        userId: gmailToken.user.id,
        provider: EmailProvider.VCB,
      });

      await this.processedEmailRepo.save(processed);
    }
  }
}
