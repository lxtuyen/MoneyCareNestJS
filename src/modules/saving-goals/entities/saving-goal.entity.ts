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

import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';

@Entity('saving_goals')
export class SavingGoal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  balance: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  target: number | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  saved_amount: number;

  @Column({ default: false })
  is_completed: boolean;

  @Column({ type: 'varchar', nullable: true })
  template_key: string | null;

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

  @Column({ default: false })
  is_selected: boolean;

  @ManyToOne(() => User, (user) => user.savingGoals, { onDelete: 'CASCADE' })
  user: User;

  @OneToMany(() => Category, (category) => category.savingGoal)
  categories: Category[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
