import {
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
} from 'class-validator';

export class CreateTransactionDto {
  @IsNumber()
  amount: number;

  @IsIn(['income', 'expense'])
  type: 'income' | 'expense';

  @IsOptional()
  @IsString()
  note?: string;

  @IsDateString()
  transactionDate: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsNumber()
  userId: number;
}
