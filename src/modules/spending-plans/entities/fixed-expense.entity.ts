import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';
import { User } from 'src/modules/user/entities/user.entity';
import { SpendingPlan } from './spending-plan.entity';
import { SpendingPlanExpenseFrequency } from '../interfaces/spending-plan.enums';
import { SpendingPlanTrackingType } from '../interfaces/spending-plan.enums';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';

@Entity('fixed_expenses')
export class FixedExpense {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SpendingPlan, (plan) => plan.fixedExpenses, {
    onDelete: 'CASCADE',
  })
  spendingPlan!: SpendingPlan;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  name!: string;

  @ManyToOne(() => Category, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  category!: Category | null;

  @ManyToOne(() => SubCategory, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  subCategory!: SubCategory | null;

  @Column({
    type: 'enum',
    enum: SpendingPlanTrackingType,
    default: SpendingPlanTrackingType.FIXED_BILL,
  })
  trackingType!: SpendingPlanTrackingType;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  monthlyLimit!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  dailyLimit!: number | null;

  @Column({
    type: 'enum',
    enum: SpendingPlanExpenseFrequency,
    default: SpendingPlanExpenseFrequency.ONCE,
  })
  frequencyType!: SpendingPlanExpenseFrequency;

  @Column({ type: 'int', default: 1 })
  frequencyValue!: number;

  @Column({ type: 'int', nullable: true })
  dueDay!: number | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({ default: false })
  isPaid!: boolean;

  @Column({ default: false })
  isReminderEnabled!: boolean;

  @Column({ type: 'int', nullable: true })
  linkedTransactionId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
