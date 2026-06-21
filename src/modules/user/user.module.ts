import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { AdminUsersController } from './admin-users.controller';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { User } from './entities/user.entity';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import { Subscription } from 'src/modules/payments/entities/subscription.entity';
import { Payment } from 'src/modules/payments/entities/payment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, SpendingPlan, Subscription, Payment]),
    forwardRef(() => TransactionsModule),
  ],
  providers: [UserService],
  controllers: [UserController, AdminUsersController],
})
export class UserModule {}

