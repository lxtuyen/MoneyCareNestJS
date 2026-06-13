import { IsOptional, IsNumber, IsDateString } from 'class-validator';

export class TransactionFilterDto {
  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsNumber()
  subCategoryId?: number;

  @IsOptional()
  @IsNumber()
  walletId?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  categoryName?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  includeTransfer?: string;

  @IsOptional()
  @IsNumber()
  coupleId?: number;
}
