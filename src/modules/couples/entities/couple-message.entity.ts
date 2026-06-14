import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Couple } from './couple.entity';
import { User } from 'src/modules/user/entities/user.entity';

@Entity('couple_messages')
export class CoupleMessage {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  coupleId!: number;

  @ManyToOne(() => Couple, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupleId' })
  couple!: Couple;

  @Column()
  senderId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'senderId' })
  sender!: User;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
