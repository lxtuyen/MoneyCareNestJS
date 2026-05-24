import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class InitialFinancialPlanExpenseDto {
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

  @IsIn(['daily', 'weekly', 'monthly'])
  frequencyType!: 'daily' | 'weekly' | 'monthly';

  @IsNumber()
  @Min(1)
  frequencyValue!: number;
}

