import { IsIn, IsOptional } from 'class-validator';

export class RunModelEvaluationDto {
  @IsOptional()
  @IsIn(['forecasting', 'budgeting'])
  modelType?: 'forecasting' | 'budgeting';
}
