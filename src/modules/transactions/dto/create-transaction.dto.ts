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

  @IsOptional()
  @IsString()
  pictuteURL?: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsNumber()
  userId: number;

  @IsOptional()
  @IsNumber()
  walletId?: number;
}
