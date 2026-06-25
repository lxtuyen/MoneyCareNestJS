import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HabitCommitment } from './entities/habit-commitment.entity';
import { HabitCommitmentsService } from './habit-commitments.service';
import { HabitCommitmentsController } from './habit-commitments.controller';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([HabitCommitment, Transaction])],
  controllers: [HabitCommitmentsController],
  providers: [HabitCommitmentsService],
  exports: [HabitCommitmentsService],
})
export class HabitCommitmentsModule {}
