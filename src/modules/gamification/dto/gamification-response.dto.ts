import { Expose, Type } from 'class-transformer';

export class BadgeResponseDto {
  @Expose()
  key!: string;

  @Expose()
  name!: string;

  @Expose()
  awardedAt!: string;
}

export class GamificationResponseDto {
  @Expose()
  id!: number;

  @Expose()
  userId!: number;

  @Expose()
  currentStreak!: number;

  @Expose()
  lastTransactionDate!: string | null;

  @Expose()
  @Type(() => BadgeResponseDto)
  badges!: BadgeResponseDto[];
}
