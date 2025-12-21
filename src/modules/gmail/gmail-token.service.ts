import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GmailToken } from './entities/gmail-token.entity';

@Injectable()
export class GmailTokenService {
  constructor(
    @InjectRepository(GmailToken)
    private readonly gmailTokenRepo: Repository<GmailToken>,
  ) {}

  async findAllConnected(): Promise<GmailToken[]> {
    return this.gmailTokenRepo.find();
  }

  async save(token: GmailToken): Promise<GmailToken> {
    return this.gmailTokenRepo.save(token);
  }
}
