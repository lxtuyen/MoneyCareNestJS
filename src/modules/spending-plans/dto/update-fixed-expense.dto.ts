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

export class UpdateFixedExpenseDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

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
