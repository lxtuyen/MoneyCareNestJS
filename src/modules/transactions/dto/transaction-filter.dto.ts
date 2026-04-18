import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class TransactionFilterDto {
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  savingGoalId?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  categoryName?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;
}
