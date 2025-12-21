import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('pending_transactions')
@Unique(['provider', 'gmailMessageId'])
export class PendingTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: number;

  @Column()
  gmailMessageId: string;

  @Column({ default: 'VCB' })
  provider: 'VCB';

  @Column()
  amount: number;

  @Column()
  currency: string;

  @Column()
  direction: 'IN' | 'OUT';

  @Column()
  transactionTime: Date;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  receiverName: string;

  @Column({ nullable: true })
  senderAccount: string;

  @Column({ nullable: true })
  orderNumber?: string;

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';

  @CreateDateColumn()
  createdAt: Date;
}
