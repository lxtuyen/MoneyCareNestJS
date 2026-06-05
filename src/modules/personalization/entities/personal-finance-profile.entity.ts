import { User } from 'src/modules/user/entities/user.entity';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('personal_finance_profiles')
export class PersonalFinanceProfile {
  @PrimaryGeneratedColumn()
  id!: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  periodStart!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  periodEnd!: Date;

  @Column({
    type: 'timestamp with time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  generatedAt!: Date;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  averageMonthlyIncome!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  averageMonthlyExpense!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  averageMonthlySavings!: number;

  @Column({ type: 'float', default: 0 })
  savingsRate!: number;

  @Column({ type: 'float', default: 0 })
  expenseVolatilityScore!: number;

  @Column({ type: 'float', default: 0 })
  budgetDisciplineScore!: number;

  @Column({ type: 'float', default: 0 })
  financialHealthScore!: number;

  @Column({ type: 'enum', enum: ['low', 'medium', 'high'], default: 'medium' })
  riskLevel!: 'low' | 'medium' | 'high';

  @Column({
    type: 'enum',
    enum: [
      'stable',
      'impulsive',
      'seasonal',
      'goal_driven',
      'income_driven',
      'insufficient_data',
    ],
    default: 'insufficient_data',
  })
  spendingStyle!:
    | 'stable'
    | 'impulsive'
    | 'seasonal'
    | 'goal_driven'
    | 'income_driven'
    | 'insufficient_data';

  @Column({ type: 'jsonb', default: () => "'[]'" })
  topExpenseCategories!: any[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  essentialCategories!: any[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  recurringExpenseHints!: any[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  frequentExpenseDays!: any[];

  @Column({
    type: 'enum',
    enum: ['increasing', 'stable', 'decreasing'],
    default: 'stable',
  })
  monthlyIncomeTrend!: 'increasing' | 'stable' | 'decreasing';

  @Column({
    type: 'enum',
    enum: ['increasing', 'stable', 'decreasing'],
    default: 'stable',
  })
  monthlyExpenseTrend!: 'increasing' | 'stable' | 'decreasing';

  @Column({ type: 'float', default: 0.1 })
  preferredBudgetBufferPct!: number;

  @Column({ type: 'float', default: 0 })
  confidenceScore!: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  feedbackSummary!: Record<string, any>;

  @Column({ type: 'varchar', default: 'v1' })
  profileVersion!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
