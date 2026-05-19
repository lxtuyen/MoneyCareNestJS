import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SpendingPlanExpenseFrequency } from '../entities/spending-plan.enums';
import { SpendingPlanTrackingType } from '../entities/spending-plan.enums';

export class CreateFixedExpenseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number;

  @IsOptional()
  @IsEnum(SpendingPlanTrackingType)
  trackingType?: SpendingPlanTrackingType;

  @IsNumber()
  @Min(0)
  amount: number;

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

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  dueDay?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;

  @IsOptional()
  @IsBoolean()
  isReminderEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  linkedTransactionId?: number | null;
}
