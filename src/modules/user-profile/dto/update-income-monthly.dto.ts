import { IsInt, Min } from 'class-validator';

export class UpdateMonthlyIncomeDto {
  @IsInt()
  @Min(0)
  monthly_income: number;
}
