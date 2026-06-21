import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('monthly_analytics_snapshots')
@Unique(['userId', 'month', 'year'])
@Index(['userId', 'isCompleted'])
export class MonthlyAnalyticsSnapshot {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  userId!: number;

  @Column({ type: 'smallint' })
  month!: number; // 1-12

  @Column({ type: 'smallint' })
  year!: number;

  @Column({ default: false })
  isCompleted!: boolean; // true = tháng đã đóng (cron job đã chạy)

  // ─── Aggregated data ───────────────────────────────────────────

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalIncome!: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  totalExpense!: number;

  @Column({ type: 'int', default: 0 })
  transactionCount!: number;

  // Category breakdown: { "Ăn uống": 1500000, "Di chuyển": 300000 }
  @Column({ type: 'jsonb', default: () => "'{}'" })
  categoryExpenses!: Record<string, number>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  categoryIncomes!: Record<string, number>;

  // ─── AI analysis (chỉ khi isCompleted = true) ──────────────────

  @Column({ type: 'int', nullable: true })
  healthScore!: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  cashFlowTrend!: string | null; // 'improving' | 'stable' | 'worsening'

  @Column({ type: 'jsonb', nullable: true })
  forecastData!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  budgetingData!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  anomalies!: any[] | null;

  @Column({ type: 'jsonb', nullable: true })
  insights!: any[] | null;

  // ─── Category stats cho anomaly detection ──────────────────────
  // { "Ăn uống": { mean: 150000, stdDev: 50000, count: 20 } }
  @Column({ type: 'jsonb', nullable: true })
  categoryStats!: Record<
    string,
    { mean: number; stdDev: number; count: number }
  > | null;

  // ─── Metadata ──────────────────────────────────────────────────

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
