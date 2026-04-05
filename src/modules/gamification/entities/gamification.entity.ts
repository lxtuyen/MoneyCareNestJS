import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface BadgeEntity {
  key: 'streak_7' | 'streak_30' | 'goal_completed';
  name: string;
  awardedAt: string; // ISO date string
}

/**
 * Stores gamification state per user: streak and badges.
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.9, 10.5
 */
@Entity('gamification')
export class GamificationEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  /**
   * Number of consecutive days the user has recorded at least 1 transaction.
   * Requirement 8.1
   */
  @Column({ default: 0 })
  currentStreak: number;

  /**
   * The calendar date of the last recorded transaction (YYYY-MM-DD).
   * Used to determine if streak should increment or reset.
   * Requirements 8.2, 8.3
   */
  @Column({ type: 'date', nullable: true })
  lastTransactionDate: string | null;

  /**
   * JSON array of BadgeEntity objects awarded to the user.
   * Requirements 8.4, 8.5, 8.6, 8.9
   */
  @Column({ type: 'jsonb', default: '[]' })
  badges: BadgeEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
