import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Subscription } from './subscription.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id!: number;

  /** PayOS orderCode — must be unique int64 */
  @Column({ type: 'bigint', unique: true })
  orderCode!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @ManyToOne(() => Subscription, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscriptionId' })
  subscription!: Subscription;

  @Column()
  subscriptionId!: number;

  @Column({ type: 'int' })
  amount!: number;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status!: PaymentStatus;

  @Column({ default: 'payos' })
  provider!: string;

  @Column({ nullable: true })
  providerTransactionId?: string;

  @Column({ type: 'jsonb', nullable: true })
  webhookData?: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  checkoutUrl?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  paidAt?: Date | null;
}
