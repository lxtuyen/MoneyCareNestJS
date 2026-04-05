import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FinanceModeEntity } from './entities/finance-mode.entity';
import { FinanceModeService } from './finance-mode.service';
import { FinanceModeController } from './finance-mode.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FinanceModeEntity])],
  controllers: [FinanceModeController],
  providers: [FinanceModeService],
  exports: [FinanceModeService],
})
export class FinanceModeModule {}
