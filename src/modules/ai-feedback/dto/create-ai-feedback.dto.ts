import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type {
  AiFeedbackDataSource,
  AiFeedbackAction,
  AiRecommendationType,
} from '../entities/ai-recommendation-feedback.entity';

export const AI_RECOMMENDATION_TYPES: AiRecommendationType[] = [
  'budget',
  'category',
  'saving_goal',
  'forecast_insight',
  'chatbot',
];

export const AI_FEEDBACK_ACTIONS: AiFeedbackAction[] = [
  'accepted',
  'modified',
  'rejected',
  'dismissed',
  'corrected',
  'helpful',
  'not_helpful',
];

export const AI_FEEDBACK_DATA_SOURCES: AiFeedbackDataSource[] = [
  'real',
  'synthetic',
];

export class CreateAiFeedbackDto {
  @IsIn(AI_RECOMMENDATION_TYPES)
  recommendationType!: AiRecommendationType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  recommendationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  sourceModelVersion?: string;

  @IsIn(AI_FEEDBACK_ACTIONS)
  userAction!: AiFeedbackAction;

  @IsObject()
  sourcePayload!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  modifiedPayload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  contextPayload?: Record<string, unknown>;

  @IsOptional()
  @IsIn(AI_FEEDBACK_DATA_SOURCES)
  dataSource?: AiFeedbackDataSource;

  @IsOptional()
  @IsObject()
  outcomePayload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reasonText?: string;
}
