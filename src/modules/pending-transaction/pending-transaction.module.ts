import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PendingTransaction } from './entities/pending-transaction.entity';
import { PendingTransactionService } from './pending-transaction.service';
import { PendingTransactionController } from './pending-transaction.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PendingTransaction])],
  providers: [PendingTransactionService],
  exports: [PendingTransactionService],
  controllers: [PendingTransactionController],
})
export class PendingTransactionModule {}
