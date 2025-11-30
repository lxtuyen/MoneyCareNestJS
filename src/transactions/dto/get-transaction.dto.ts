import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class GetTransactionDto {
  @IsNumber()
  userId: number;

  @IsNumber()
  fundId: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
