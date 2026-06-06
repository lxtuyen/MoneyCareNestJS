import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum GoalPlanProgressStatus {
  ON_TRACK = 'on_track',
  DELAYED = 'delayed',
}

export class GoalPlanInsightGoalDto {
  @IsString()
  name: string;

  @IsEnum(GoalPlanProgressStatus)
  status: GoalPlanProgressStatus;
}

export class GoalPlanInsightPlanDto {
  @IsString()
  name: string;

  @IsEnum(GoalPlanProgressStatus)
  status: GoalPlanProgressStatus;

  @IsNumber()
  plannedToDate: number;

  @IsNumber()
  actualSpent: number;

  @IsNumber()
  overAmount: number;
}

export class GoalPlanInsightCategoryDto {
  @IsString()
  name: string;

  @IsEnum(GoalPlanProgressStatus)
  status: GoalPlanProgressStatus;

  @IsNumber()
  plannedToDate: number;

  @IsNumber()
  actualSpent: number;

  @IsNumber()
  overAmount: number;
}

export class GoalPlanInsightDto {
  @IsNumber()
  userId: number;

  @IsString()
  selectedMonth: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => GoalPlanInsightGoalDto)
  goal: GoalPlanInsightGoalDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => GoalPlanInsightPlanDto)
  plan: GoalPlanInsightPlanDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoalPlanInsightCategoryDto)
  categories: GoalPlanInsightCategoryDto[];
}

export class GoalPlanInsightResponseDto {
  @IsEnum(GoalPlanProgressStatus)
  status: GoalPlanProgressStatus;

  @IsString()
  summary: string;

  @IsString()
  reason: string;

  @IsString()
  suggestion: string;

  @IsOptional()
  @IsNumber()
  projectedDaysDiff?: number;

  @IsOptional()
  @IsString()
  projectionStatus?: string;
}
