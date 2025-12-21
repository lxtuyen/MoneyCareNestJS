import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class TransactionFilterDto {
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsNumber()
  fundId: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
