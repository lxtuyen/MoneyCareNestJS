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
  pictureURL?: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number;

  @IsNumber()
  userId: number;

  @IsOptional()
  @IsNumber()
  walletId?: number;
}
