import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Transaction } from 'src/transactions/entities/transaction.entity';

export class CreateNotificationDto {
  @IsNumber()
  userId: number;

  @IsOptional()
  transaction?: Transaction;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  type: string;
}
