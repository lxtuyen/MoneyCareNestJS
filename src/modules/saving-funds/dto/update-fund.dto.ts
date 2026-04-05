import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { UpdateCategoryDto } from 'src/modules/categories/dto/update-category.dto';
import { FundType } from '../entities/fund.entity';

export class UpdateFundDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsEnum(FundType)
  type?: FundType;

  @IsOptional()
  @IsBoolean()
  is_selected?: boolean;

  // ── SPENDING fund fields ─────────────────────────────────────────────────────

  @IsOptional()
  @IsNumber()
  balance?: number;

  @IsOptional()
  @IsNumber()
  monthly_limit?: number;

  @IsOptional()
  @IsNumber()
  spent_current_month?: number;

  @IsOptional()
  @IsBoolean()
  notified_70?: boolean;

  @IsOptional()
  @IsBoolean()
  notified_90?: boolean;

  // ── SAVING_GOAL fund fields ──────────────────────────────────────────────────

  @IsOptional()
  @IsNumber()
  target?: number;

  @IsOptional()
  @IsNumber()
  saved_amount?: number;

  @IsOptional()
  @IsBoolean()
  is_completed?: boolean;

  @IsOptional()
  @IsString()
  template_key?: string;

  // ── Common ───────────────────────────────────────────────────────────────────

  @IsOptional()
  start_date?: Date;

  @IsOptional()
  end_date?: Date;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateCategoryDto)
  categories?: UpdateCategoryDto[];
}
