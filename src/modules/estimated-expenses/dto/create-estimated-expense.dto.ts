import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { SpendingPlanExpenseFrequency } from 'src/modules/spending-plans/interfaces/spending-plan.enums';

export class CreateEstimatedExpenseDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number;

  @IsNumber()
  @Min(0)
  amount!: number;

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
