import { IsObject } from 'class-validator';

export class UpdateAiFeedbackOutcomeDto {
  @IsObject()
  outcomePayload!: Record<string, unknown>;
}
