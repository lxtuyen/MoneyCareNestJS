import { IsDateString, IsOptional } from 'class-validator';

/**
 * DTO for POST /gamification/record-day
 * Optionally accepts a date (defaults to today if omitted).
 */
export class RecordDayDto {
  @IsOptional()
  @IsDateString()
  date?: string; // YYYY-MM-DD, defaults to today (UTC)
}

/**
 * DTO for awarding a badge externally (e.g., from goal-fund completion).
 */
export class AwardBadgeDto {
  key: 'streak_7' | 'streak_30' | 'goal_completed';
  name: string;
}
