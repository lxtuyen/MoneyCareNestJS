import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavingFund } from './entities/saving-fund.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SavingFundsService } from './saving-funds.service';
import { SavingFundsController } from './saving-funds.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SavingFund, User, Category])],
  controllers: [SavingFundsController],
  providers: [SavingFundsService],
  exports: [SavingFundsService],
})
export class SavingFundsModule {}
