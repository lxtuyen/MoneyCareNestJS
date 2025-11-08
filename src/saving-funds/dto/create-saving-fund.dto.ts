import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateCategoryDto } from 'src/categories/dto/create-category.dto';

export class CreateSavingFundDto {
  @IsString()
  name: string;

  @IsBoolean()
  @IsOptional()
  is_custom?: boolean;

  @IsNumber()
  userId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  @IsOptional()
  categories?: CreateCategoryDto[];
}
