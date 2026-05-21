import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';
import { User } from 'src/modules/user/entities/user.entity';
import { FixedExpense } from './fixed-expense.entity';
import {
  SpendingPlanRiskLevel,
  SpendingPlanStatus,
} from '../interfaces/spending-plan.enums';

@Entity('spending_plans')
export class SpendingPlan {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  totalAmount!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  savingTargetAmount!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  fixedExpenseTotal!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  availableSpendingAmount!: number;

  @Column({
    type: 'enum',
    enum: SpendingPlanStatus,
    default: SpendingPlanStatus.DRAFT,
  })
  status!: SpendingPlanStatus;

  @Column({
    type: 'enum',
    enum: SpendingPlanRiskLevel,
    default: SpendingPlanRiskLevel.WARNING,
  })
  riskLevel!: SpendingPlanRiskLevel;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @OneToMany(() => FixedExpense, (fixedExpense) => fixedExpense.spendingPlan, {
    cascade: true,
  })
  fixedExpenses!: FixedExpense[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  activatedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  archivedAt!: Date | null;
}
