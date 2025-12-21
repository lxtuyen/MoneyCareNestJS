import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CreateCategoryDto } from 'src/modules/categories/dto/create-category.dto';

export class CreateSavingFundDto {
  @IsString()
  name: string;

  @IsNumber()
  userId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  @IsOptional()
  categories?: CreateCategoryDto[];
}
