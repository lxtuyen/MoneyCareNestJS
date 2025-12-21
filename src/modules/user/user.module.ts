import { forwardRef, Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';

@Module({
  imports: [forwardRef(() => TransactionsModule)],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
