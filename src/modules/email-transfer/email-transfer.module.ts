import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTransferService } from './email-transfer.service';
import { EmailTransferController } from './email-transfer.controller';
import { EmailTransfer } from './entities/email-transfer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailTransfer])],
  controllers: [EmailTransferController],
  providers: [EmailTransferService],
})
export class EmailTransferModule {}
