import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const SCENARIO_TYPES = [
  'reduce_frequency_expense',
  'reduce_category_spending',
  'income_drop',
  'one_time_purchase',
  'increase_saving_goal',
  'extend_goal_deadline',
] as const;

export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export class SimulateScenarioDto {
  @IsIn(SCENARIO_TYPES)
  scenarioType!: ScenarioType;

  @IsObject()
  @IsNotEmpty()
  params!: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  goalIds?: number[];
}
