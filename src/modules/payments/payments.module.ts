import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsService } from './payments.service';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Payment])],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
