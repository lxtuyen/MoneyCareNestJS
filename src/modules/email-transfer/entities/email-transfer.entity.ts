import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';

@Entity('email_transfer')
export class EmailTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  fromEmail: string;

  @Column()
  subject: string;

  @Column({ type: 'text' })
  rawContent: string;

  @Column({ nullable: true })
  bankName: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  amount: number;

  @Column({ nullable: true })
  transactionCode: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @CreateDateColumn()
  created_at: Date;
}
