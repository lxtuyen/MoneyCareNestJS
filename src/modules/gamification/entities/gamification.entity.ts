import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';

@Entity('gamification')
export class GamificationEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  userId!: number;

  @OneToOne(() => User, (user) => user.gamification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ default: 0 })
  currentStreak!: number;

  @Column({ type: 'date', nullable: true })
  lastTransactionDate!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  badges!: { key: string; name: string; awardedAt: string }[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
