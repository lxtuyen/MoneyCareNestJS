import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payment.controller';
import { PaymentsService } from './payment.service';
import { VipPayment } from './entities/payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([VipPayment])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
