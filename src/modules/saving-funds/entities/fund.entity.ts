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

@Entity('funds')
export class Fund {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({
    type: 'enum',
    enum: FundType,
    default: FundType.SPENDING,
  })
  type: FundType;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  balance: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  monthly_limit: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  spent_current_month: number;

  @Column({ default: false })
  notified_70: boolean;

  @Column({ default: false })
  notified_90: boolean;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  target: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
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

  @ManyToOne(() => User, (user) => user.funds, { onDelete: 'CASCADE' })
  user: User;

  @OneToMany(() => Category, (category) => category.fund)
  categories: Category[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
