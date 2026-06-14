import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Couple } from './couple.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { User } from 'src/modules/user/entities/user.entity';

@Entity('couple_spending_alerts')
@Index(['coupleId', 'alertKey'], { unique: true })
export class CoupleSpendingAlert {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Couple, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'coupleId' })
  couple!: Couple;

  @Column()
  coupleId!: number;

  @Column()
  alertKey!: string;

  @Column({ type: 'varchar', length: 40 })
  type!: string;

  @Column({ type: 'varchar', length: 20, default: 'medium' })
  severity!: 'low' | 'medium' | 'high';

  @Column()
  title!: string;

  @Column({ type: 'text' })
  message!: string;

  @ManyToOne(() => Transaction, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'transactionId' })
  transaction?: Transaction | null;

  @Column({ nullable: true })
  transactionId?: number | null;

  @ManyToOne(() => Category, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: Category | null;

  @Column({ nullable: true })
  categoryId?: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  amount?: number | null;

  @Column({ type: 'jsonb', nullable: true })
  details?: {
    exceededCategories?: string[];
    atRiskCategories?: string[];
    anomalies?: Array<{
      id: number;
      categoryName: string;
      amount: number;
      date: string;
      note: string;
    }>;
    projectedSaving?: number;
    savingGoalImpacts?: string[];
    impactsGoals?: boolean;
  } | null;

  @Column({ default: false })
  isRead!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status!: 'open' | 'resolved' | 'dismissed';

  @Column({ type: 'varchar', length: 20, nullable: true })
  feedback?: 'correct' | 'incorrect' | 'ignored' | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'feedbackById' })
  feedbackBy?: User | null;

  @Column({ nullable: true })
  feedbackById?: number | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  feedbackAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
