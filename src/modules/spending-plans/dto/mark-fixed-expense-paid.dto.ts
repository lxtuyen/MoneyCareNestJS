import { IsNumber, IsOptional } from 'class-validator';

export class MarkFixedExpensePaidDto {
  @IsOptional()
  @IsNumber()
  transactionId?: number | null;
}
