import {
  IsArray,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateEstimatedExpenseDto } from 'src/modules/estimated-expenses/dto/create-estimated-expense.dto';

export class CreateSpendingPlanDto {
  @IsNumber()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateEstimatedExpenseDto)
  estimatedExpenses?: CreateEstimatedExpenseDto[];
}
