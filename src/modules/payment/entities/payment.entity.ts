import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('premium_payments')
export class VipPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar', length: 20 })
  platform: 'google_pay' | 'apple_pay';

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10 })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'SUCCEEDED' })
  status: 'SUCCEEDED' | 'FAILED';

  @Column({ type: 'json', nullable: true })
  paymentData?: any;

  @CreateDateColumn()
  createdAt: Date;
}
