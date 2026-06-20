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
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import { SpendingPlanExpenseFrequency } from 'src/modules/spending-plans/interfaces/spending-plan.enums';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';

@Entity('estimated_expenses')
export class EstimatedExpense {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => SpendingPlan, (plan) => plan.estimatedExpenses, {
    onDelete: 'CASCADE',
  })
  spendingPlan!: SpendingPlan;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

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
  savingGoalId!: number | null;

  @Column({ type: 'int', nullable: true })
  coupleSavingGoalId!: number | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
