import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GmailProcessorService } from './gmail-processor.service';
import { GmailToken } from './entities/gmail-token.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Injectable()
export class GmailCronService {
  constructor(
    private readonly processor: GmailProcessorService,
    @InjectRepository(GmailToken)
    private readonly gmailTokenRepo: Repository<GmailToken>,
  ) {}

  @Cron('*/3 * * * *')
  async handleVCBImport() {
    const tokens = await this.gmailTokenRepo.find({
      relations: ['user'],
    });
    for (const token of tokens) {
      if (token.user.isVip !== true) continue;
      await this.processor.processVCBEmails(token);
    }
  }
}
