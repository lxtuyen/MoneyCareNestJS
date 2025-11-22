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

  @IsDateString()
  transactionDate: string;

  @IsNumber()
  categoryId?: number;

  @IsNumber()
  userId: number;
}
