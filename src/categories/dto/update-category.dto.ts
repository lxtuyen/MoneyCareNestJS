import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @IsOptional()
  @IsNumber()
  savingFundId?: number;
}
