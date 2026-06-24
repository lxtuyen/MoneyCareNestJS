import { IsString, IsNumber, IsOptional } from 'class-validator';

export class ConfirmRecurringDto {
  @IsString()
  aiRecurringId!: string;

  @IsString()
  description!: string;

  @IsString()
  categoryName!: string;

  @IsString()
  @IsOptional()
  categoryIcon?: string;

  @IsNumber()
  averageAmount!: number;

  @IsString()
  frequency!: string;

  @IsNumber()
  monthlyEstimate!: number;

  @IsNumber()
  @IsOptional()
  expectedDay?: number;
}

export class DismissRecurringDto {
  @IsString()
  aiRecurringId!: string;
}
