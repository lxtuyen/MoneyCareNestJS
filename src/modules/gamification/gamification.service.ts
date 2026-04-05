import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BadgeEntity,
  GamificationEntity,
} from './entities/gamification.entity';
import { RecordDayDto, AwardBadgeDto } from './dto/gamification.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

/** Badge metadata keyed by badge key */
const BADGE_META: Record<
  'streak_7' | 'streak_30' | 'goal_completed',
  string
> = {
  streak_7: 'Tiết kiệm 7 ngày',
  streak_30: 'Tiết kiệm 30 ngày',
  goal_completed: 'Mục tiêu hoàn thành',
};

@Injectable()
export class GamificationService {
  constructor(
    @InjectRepository(GamificationEntity)
    private readonly gamificationRepo: Repository<GamificationEntity>,
  ) {}

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Get today's date as YYYY-MM-DD (UTC). */
  private todayString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * Find or create the gamification record for a user.
   * Ensures exactly one record per userId.
   */
  private async findOrCreate(userId: number): Promise<GamificationEntity> {
    let record = await this.gamificationRepo.findOne({ where: { userId } });
    if (!record) {
      record = this.gamificationRepo.create({
        userId,
        currentStreak: 0,
        lastTransactionDate: null,
        badges: [],
      });
      record = await this.gamificationRepo.save(record);
    }
    return record;
  }

  /**
   * Calculate the new streak given the current record and the transaction date.
   *
   * Rules (Requirements 8.1, 8.2, 8.3):
   * - If lastTransactionDate is null → streak becomes 1 (first ever transaction).
   * - If transactionDate == lastTransactionDate → same day, no change (idempotent).
   * - If transactionDate is exactly 1 calendar day after lastTransactionDate → streak + 1.
   * - Otherwise (gap > 1 day) → streak resets to 1.
   */
  calculateNewStreak(
    currentStreak: number,
    lastTransactionDate: string | null,
    transactionDate: string,
  ): number {
    if (!lastTransactionDate) {
      return 1;
    }

    const last = new Date(lastTransactionDate);
    const current = new Date(transactionDate);

    // Normalize to midnight UTC to compare calendar days
    const diffMs = current.getTime() - last.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Same day — already recorded, streak unchanged
      return currentStreak;
    } else if (diffDays === 1) {
      // Consecutive day
      return currentStreak + 1;
    } else {
      // Gap detected — reset streak
      return 1;
    }
  }

  /**
   * Determine which streak badges should be awarded based on the new streak.
   * Idempotent: only awards badges not already present.
   * Requirements 8.4, 8.5, 8.9
   */
  determineStreakBadges(
    currentStreak: number,
    existingBadges: BadgeEntity[],
  ): BadgeEntity[] {
    const newBadges: BadgeEntity[] = [];
    const existingKeys = new Set(existingBadges.map((b) => b.key));

    const thresholds: Array<'streak_7' | 'streak_30'> = ['streak_7', 'streak_30'];
    const thresholdValues: Record<'streak_7' | 'streak_30', number> = {
      streak_7: 7,
      streak_30: 30,
    };

    for (const key of thresholds) {
      if (currentStreak >= thresholdValues[key] && !existingKeys.has(key)) {
        newBadges.push({
          key,
          name: BADGE_META[key],
          awardedAt: new Date().toISOString(),
        });
      }
    }

    return newBadges;
  }

  /**
   * Award a badge idempotently (e.g., 'goal_completed' triggered externally).
   * Requirements 8.6, 8.9
   */
  async awardBadge(
    userId: number,
    dto: AwardBadgeDto,
  ): Promise<ApiResponse<GamificationEntity>> {
    const record = await this.findOrCreate(userId);

    const alreadyAwarded = record.badges.some((b) => b.key === dto.key);
    if (!alreadyAwarded) {
      record.badges = [
        ...record.badges,
        {
          key: dto.key,
          name: dto.name ?? BADGE_META[dto.key],
          awardedAt: new Date().toISOString(),
        },
      ];
      await this.gamificationRepo.save(record);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: record,
    });
  }

  // ---------------------------------------------------------------------------
  // Public API methods
  // ---------------------------------------------------------------------------

  /**
   * GET /gamification — retrieve the current gamification state for the user.
   * Requirements 8.8, 10.5
   */
  async findByUser(userId: number): Promise<ApiResponse<GamificationEntity>> {
    const record = await this.findOrCreate(userId);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: record,
    });
  }

  /**
   * POST /gamification/record-day — record a transaction day for the user.
   *
   * - Updates streak (increment, same-day no-op, or reset).
   * - Awards streak badges idempotently.
   * - Persists to backend (Requirement 10.5).
   *
   * Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.9
   */
  async recordDay(
    userId: number,
    dto: RecordDayDto,
  ): Promise<ApiResponse<GamificationEntity>> {
    const transactionDate = dto.date ?? this.todayString();
    const record = await this.findOrCreate(userId);

    const newStreak = this.calculateNewStreak(
      record.currentStreak,
      record.lastTransactionDate,
      transactionDate,
    );

    // Only update lastTransactionDate if the date is newer (or first time)
    const isNewDay =
      !record.lastTransactionDate ||
      transactionDate > record.lastTransactionDate;

    if (isNewDay) {
      record.currentStreak = newStreak;
      record.lastTransactionDate = transactionDate;

      // Check and award streak badges
      const newBadges = this.determineStreakBadges(newStreak, record.badges);
      if (newBadges.length > 0) {
        record.badges = [...record.badges, ...newBadges];
      }

      await this.gamificationRepo.save(record);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: isNewDay
        ? `Streak cập nhật: ${record.currentStreak} ngày`
        : 'Đã ghi nhận hôm nay rồi',
      data: record,
    });
  }
}
