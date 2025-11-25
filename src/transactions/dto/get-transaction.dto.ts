import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class GetTransactionDto {
  @IsNumber()
  userId: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
