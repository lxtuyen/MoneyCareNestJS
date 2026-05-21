import {
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFixedExpenseDto } from './create-fixed-expense.dto';

export class UpdateSpendingPlanDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  savingTargetAmount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFixedExpenseDto)
  fixedExpenses?: CreateFixedExpenseDto[];
}
