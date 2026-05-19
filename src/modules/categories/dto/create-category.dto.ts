import { IsString, IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { CategoryType } from '../entities/category.entity';

export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsEnum(CategoryType)
  type?: CategoryType;

  @IsOptional()
  isEssential?: boolean;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;
}
