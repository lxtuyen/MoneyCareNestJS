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

export enum CoupleRole {
  OWNER = 'owner',
  PARTNER = 'partner',
}

@Entity('couple_members')
export class CoupleMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Couple, (couple) => couple.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupleId' })
  couple!: Couple;

  @Column()
  coupleId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({
    type: 'enum',
    enum: CoupleRole,
  })
  role!: CoupleRole;

  @Column({ default: false })
  sharePersonalTransactions!: boolean;

  @Column({ default: false })
  allowAiShare!: boolean;

  @CreateDateColumn()
  joinedAt!: Date;
}
