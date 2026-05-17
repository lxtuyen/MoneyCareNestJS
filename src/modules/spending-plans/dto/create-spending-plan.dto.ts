import {
  IsArray,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateFixedExpenseDto } from './create-fixed-expense.dto';

export class CreateSpendingPlanDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @IsNumber()
  @Min(2000)
  year?: number;

  @IsNumber()
  @Min(0)
  totalAmount: number;



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
