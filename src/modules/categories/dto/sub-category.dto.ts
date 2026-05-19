import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { CategoryType } from '../entities/category.entity';

export class CreateSubCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsNumber()
  categoryId: number;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;
}

export class UpdateSubCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  @IsNumber()
  categoryId?: number;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;
}
