import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailTransfer } from './entities/email-transfer.entity';
import { DetectTransferDto } from './dto/detect-transfer.dto';
import { parseBankMail } from './parsers/bank-mail.parser';
import { User } from '../user/entities/user.entity';

@Injectable()
export class EmailTransferService {
  private readonly logger = new Logger(EmailTransferService.name);

  constructor(
    @InjectRepository(EmailTransfer)
    private readonly transferRepo: Repository<EmailTransfer>,
  ) {}

  async detectTransfer(user: User, dto: DetectTransferDto) {
    const parsed = parseBankMail(dto.content);

    if (!parsed) {
      this.logger.log('Not a transfer email');
      return null;
    }

    const transfer = this.transferRepo.create({
      fromEmail: dto.from,
      subject: dto.subject,
      rawContent: dto.content,
      bankName: parsed.bankName,
      amount: parsed.amount,
      transactionCode: parsed.transactionCode,
      user,
    });

    return this.transferRepo.save(transfer);
  }
}
