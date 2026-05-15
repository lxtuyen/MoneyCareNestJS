import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { CategoryType } from 'src/modules/categories/entities/category.entity';

export class AdminCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  @IsBoolean()
  isEssential?: boolean;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;
}

export class UpdateAdminCategoryDto {
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
  @IsBoolean()
  isEssential?: boolean;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;
}
