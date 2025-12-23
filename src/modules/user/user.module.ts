import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { PaymentsModule } from '../payment/payment.module';
import { VipPayment } from '../payment/entities/payment.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, VipPayment]),
    forwardRef(() => TransactionsModule),
    PaymentsModule,
  ],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
