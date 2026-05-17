import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';
import { User } from 'src/modules/user/entities/user.entity';
import { SpendingPlan } from './spending-plan.entity';
import { SpendingPlanRiskLevel } from './spending-plan.enums';

@Entity('spending_plan_snapshots')
export class SpendingPlanSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => SpendingPlan, (plan) => plan.snapshots, {
    onDelete: 'CASCADE',
  })
  spendingPlan: SpendingPlan;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column({ type: 'date' })
  snapshotDate: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  spentFlexibleAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  spentFixedAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  remainingSpendingAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  todaySpent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  todayOverAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  projectedEndBalance: number;

  @Column({
    type: 'enum',
    enum: SpendingPlanRiskLevel,
    default: SpendingPlanRiskLevel.WARNING,
  })
  riskLevel: SpendingPlanRiskLevel;

  @CreateDateColumn()
  createdAt: Date;
}
