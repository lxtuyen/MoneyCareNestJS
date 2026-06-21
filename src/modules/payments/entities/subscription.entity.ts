import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';

export enum SubscriptionStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  GRACE = 'grace',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, (user) => user.subscriptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ default: 'premium_monthly' })
  plan!: string;

  @Column({ type: 'int', default: 49999 })
  amount!: number;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PENDING,
  })
  status!: SubscriptionStatus;

  @Column({ default: false })
  isTrial!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  startDate?: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  endDate?: Date | null;

  /** endDate + 3 ngày — vẫn cho xem nhưng hiện cảnh báo */
  @Column({ type: 'timestamp with time zone', nullable: true })
  graceEndDate?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
