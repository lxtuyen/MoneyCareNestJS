import {
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
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

export class UpdateTransactionDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsIn(['income', 'expense'])
  type?: 'income' | 'expense';

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
  categoryId?: number | null;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number | null;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsNumber()
  walletId?: number | null;

  @IsOptional()
  @IsNumber()
  coupleId?: number | null;

  @IsOptional()
  @IsNumber()
  payerId?: number | null;

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
