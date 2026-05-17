import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class CloneSpendingPlanDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsNumber()
  @Min(2000)
  year?: number;
}
