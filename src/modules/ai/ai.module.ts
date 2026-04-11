import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { Fund } from 'src/modules/saving-funds/entities/fund.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionsModule } from 'src/modules/transactions/transactions.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Fund, Category, User]),
    TransactionsModule,
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
