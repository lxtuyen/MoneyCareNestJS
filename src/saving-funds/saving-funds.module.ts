import { Module } from '@nestjs/common';
import { SavingFundsService } from './saving-funds.service';
import { SavingFundsController } from './saving-funds.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingFund } from './entities/saving-fund.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SavingFund])],
  controllers: [SavingFundsController],
  providers: [SavingFundsService],
})
export class SavingFundsModule {}
