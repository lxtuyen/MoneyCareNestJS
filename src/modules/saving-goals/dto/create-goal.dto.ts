import { IsString, IsNumber, IsOptional, IsArray, IsDateString } from 'class-validator';

export class CreateSavingGoalDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  userId?: number;

  @IsNumber()
  @IsOptional()
  target?: number;

  @IsNumber()
  @IsOptional()
  saved_amount?: number;

  @IsString()
  @IsOptional()
  template_key?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  categoryIds?: number[];
}
