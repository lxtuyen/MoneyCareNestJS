import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SpendingPlanExpenseFrequency } from 'src/modules/spending-plans/interfaces/spending-plan.enums';

export class UpdateEstimatedExpenseDto {
  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsNumber()
  categoryId?: number | null;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyLimit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dailyLimit?: number | null;

  @IsOptional()
  @IsEnum(SpendingPlanExpenseFrequency)
  frequencyType?: SpendingPlanExpenseFrequency;

  @IsOptional()
  @IsNumber()
  @Min(1)
  frequencyValue?: number;
}
