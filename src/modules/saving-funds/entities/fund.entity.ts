import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';

export enum FundType {
  SPENDING = 'SPENDING',
  SAVING_GOAL = 'SAVING_GOAL',
}

/**
 * Unified financial fund entity.
 *
 * SPENDING funds: track daily expenses, support monthly balance limits.
 * SAVING_GOAL funds: track progress toward a savings target (e.g. buy a laptop).
 */
@Entity('funds')
export class Fund {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  // ── Type ────────────────────────────────────────────────────────────────────

  @Column({
    type: 'enum',
    enum: FundType,
    default: FundType.SPENDING,
  })
  type: FundType;

  // ── Spending-wallet fields ───────────────────────────────────────────────────

  /** Current allocated balance for a SPENDING fund (formerly `balance`). */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  /** Optional spending cap per calendar month (replaces BudgetEntity.amount). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  monthly_limit: number | null;

  /** Running total of expenses in the current calendar month. Auto-updated on transaction. */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  spent_current_month: number;

  /** Flags for monthly-limit notifications (70% and 90% thresholds). */
  @Column({ default: false })
  notified_70: boolean;

  @Column({ default: false })
  notified_90: boolean;

  // ── Saving-goal fields ───────────────────────────────────────────────────────

  /** Target amount to reach (SAVING_GOAL) or optional spending ceiling (SPENDING). */
  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  target: number | null;

  /** Amount saved so far — manually updated for SAVING_GOAL funds. */
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  saved_amount: number;

  /** Whether the savings goal has been reached. */
  @Column({ default: false })
  is_completed: boolean;

  /** Template key for quick-start goals: 'laptop' | 'travel' | 'course' | null */
  @Column({ type: 'varchar', nullable: true })
  template_key: string | null;

  // ── Common fields ────────────────────────────────────────────────────────────

  @Column({ type: 'timestamp', nullable: true })
  start_date: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  end_date: Date | null;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'EXPIRED', 'COMPLETED', 'ARCHIVED'],
    default: 'ACTIVE',
  })
  status: string;

  @Column({ default: false })
  completion_notified: boolean;

  /** Only meaningful for SPENDING funds — marks the fund currently in use. */
  @Column({ default: false })
  is_selected: boolean;

  @ManyToOne(() => User, (user) => user.funds, { onDelete: 'CASCADE' })
  user: User;

  @OneToMany(() => Category, (category) => category.fund)
  categories: Category[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
