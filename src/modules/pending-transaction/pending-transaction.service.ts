import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PendingTransaction } from './entities/pending-transaction.entity';
import { CreatePendingTransactionInput } from './dto/create-pending-transaction.dto';
import { PendingTransactionDto } from './dto/pending-transaction.dto';

@Injectable()
export class PendingTransactionService {
  constructor(
    @InjectRepository(PendingTransaction)
    private readonly repo: Repository<PendingTransaction>,
  ) {}

  async createIfNotExists(
    input: CreatePendingTransactionInput,
  ): Promise<PendingTransaction | null> {
    const existed = await this.repo.findOne({
      where: {
        provider: input.provider,
        gmailMessageId: input.gmailMessageId,
      },
    });

    if (existed) return null;

    const entity = this.repo.create({
      ...input,
    });

    return this.repo.save(entity);
  }

  async listPending(userId: number): Promise<PendingTransactionDto[]> {
    const pendingTransactions = await this.repo.find({
      where: { userId, status: 'PENDING' },
      order: { transactionTime: 'DESC' },
    });

    return pendingTransactions.map((tx) => ({
      id: tx.id,
      amount: tx.amount,
      currency: tx.currency,
      direction: tx.direction,
      transactionTime: tx.transactionTime,
      description: tx.description,
      receiverName: tx.receiverName,
    }));
  }

  async confirm(id: string) {
    const imported = await this.repo.findOneByOrFail({ id });

    imported.status = 'CONFIRMED';
    await this.repo.save(imported);
  }

  async remove(id: string): Promise<void> {
    await this.repo.delete(id);
  }
}
