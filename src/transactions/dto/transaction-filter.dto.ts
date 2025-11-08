import { IsOptional, IsEnum, IsNumber, IsDateString } from 'class-validator';

export class TransactionFilterDto {
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsEnum(['income', 'expense'])
  type?: 'income' | 'expense';

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}
