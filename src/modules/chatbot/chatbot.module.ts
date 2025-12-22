import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatbotController } from './chatbot.controller';
import { ChatbotService } from './chatbot.service';
import { SavingFund } from 'src/modules/saving-funds/entities/saving-fund.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { AiGeminiChatbotService } from './ai-chatbot-gemini.service';
import { TransactionService } from 'src/modules/transactions/transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavingFund, Category, Transaction, User]),
  ],
  controllers: [ChatbotController],
  providers: [ChatbotService, AiGeminiChatbotService, TransactionService],
})
export class ChatbotModule {}
