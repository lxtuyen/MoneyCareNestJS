import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';
import { User } from './entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    forwardRef(() => TransactionsModule),
  ],
  providers: [UserService],
  controllers: [UserController],
})
export class UserModule {}
