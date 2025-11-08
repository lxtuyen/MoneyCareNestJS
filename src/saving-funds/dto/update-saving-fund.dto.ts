import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { UpdateCategoryDto } from 'src/categories/dto/update-category.dto';

export class UpdateSavingFundDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_custom?: boolean;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCategoryDto)
  categories?: UpdateCategoryDto[];
}
