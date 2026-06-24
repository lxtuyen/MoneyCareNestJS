import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';

@Entity('recurring_transactions')
export class RecurringTransaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  description!: string;

  @Column({ nullable: true })
  categoryName!: string;

  @Column({ nullable: true })
  categoryIcon!: string;

  @Column('decimal')
  averageAmount!: number;

  @Column()
  frequency!: string; // 'weekly' | 'bi_weekly' | 'monthly'

  @Column('decimal', { default: 0 })
  monthlyEstimate!: number;

  @Column({ nullable: true })
  expectedDay!: number;

  @Column({ default: 'confirmed' })
  status!: string; // 'confirmed' | 'dismissed'

  @Column({ nullable: true })
  aiRecurringId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
