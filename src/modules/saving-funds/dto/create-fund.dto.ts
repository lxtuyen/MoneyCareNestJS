import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { CreateCategoryDto } from 'src/modules/categories/dto/create-category.dto';
import { FundType } from '../entities/fund.entity';

export class CreateFundDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  userId?: number;

  // ── Type ────────────────────────────────────────────────────────────────────

  @IsEnum(FundType)
  @IsOptional()
  type?: FundType;

  // ── SPENDING fund fields ─────────────────────────────────────────────────────

  /** Initial balance / spending capacity. */
  @IsNumber()
  @IsOptional()
  balance?: number;

  /** Optional monthly spending cap. */
  @IsNumber()
  @IsOptional()
  monthly_limit?: number;

  // ── SAVING_GOAL fund fields ──────────────────────────────────────────────────

  /** Target savings amount. */
  @IsNumber()
  @IsOptional()
  target?: number;

  /** Initial saved amount (defaults to 0). */
  @IsNumber()
  @IsOptional()
  saved_amount?: number;

  /** Template key: 'laptop' | 'travel' | 'course' */
  @IsString()
  @IsOptional()
  template_key?: string;

  // ── Common ───────────────────────────────────────────────────────────────────

  @IsOptional()
  start_date?: Date;

  @IsOptional()
  end_date?: Date;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateCategoryDto)
  @IsOptional()
  categories?: CreateCategoryDto[];
}
