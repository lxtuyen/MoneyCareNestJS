import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class GetTransactionDto {
  @IsNumber()
  userId: number;

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
  type?: string;
}
