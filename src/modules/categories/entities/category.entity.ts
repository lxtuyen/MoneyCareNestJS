import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  UpdateDateColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

export enum CategoryType {
  INCOME = 'income',
  EXPENSE = 'expense',
  OTHERS = 'others',
}

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ type: 'float', default: 0 })
  percentage: number;

  @Column({ type: 'enum', enum: CategoryType, default: CategoryType.EXPENSE })
  type: CategoryType;

  @Column({ default: true })
  isEssential: boolean;

  @ManyToOne(() => SavingGoal, (goal) => goal.categories, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  savingGoal: SavingGoal | null;

  /// Category thuộc về user trực tiếp (không gắn với quỹ)
  @ManyToOne(() => User, (user) => user.categories, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  user: User | null;

  @OneToMany(() => Transaction, (trans) => trans.category)
  transactions: Transaction[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
