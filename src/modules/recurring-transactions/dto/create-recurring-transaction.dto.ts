import { IsEnum, IsNumber, IsOptional, IsString, IsDateString, IsBoolean } from 'class-validator';
import { RecurringFrequency } from '../entities/recurring-transaction.entity';

export class CreateRecurringTransactionDto {
  @IsNumber()
  amount: number;

  @IsEnum(['income', 'expense'])
  type: 'income' | 'expense';

  @IsEnum(RecurringFrequency)
  frequency: RecurringFrequency;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsNumber()
  userId: number;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
