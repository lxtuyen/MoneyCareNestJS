import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class TransactionSplitDto {
  @IsNumber()
  userId!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  percent?: number;
}

export class CreateTransactionDto {
  @IsNumber()
  @Min(1)
  amount!: number;

  @IsIn(['income', 'expense'])
  type!: 'income' | 'expense';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  pictureURL?: string;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number;

  @IsNumber()
  userId!: number;

  @IsOptional()
  @IsNumber()
  walletId?: number;

  @IsOptional()
  @IsNumber()
  coupleId?: number;

  @IsOptional()
  @IsNumber()
  payerId?: number;

  @IsOptional()
  @IsString()
  @IsIn(['none', 'equal', 'percentage', 'fixed'])
  splitMethod?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => TransactionSplitDto)
  splits?: TransactionSplitDto[];
}
