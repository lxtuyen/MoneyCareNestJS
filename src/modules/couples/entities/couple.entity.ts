import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CoupleMember } from './couple-member.entity';

export enum CoupleStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  LEFT = 'left',
}

@Entity('couples')
export class Couple {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  inviteCode!: string;

  @Column({
    type: 'enum',
    enum: CoupleStatus,
    default: CoupleStatus.PENDING,
  })
  status!: CoupleStatus;

  @OneToMany(() => CoupleMember, (member) => member.couple, { cascade: true })
  members!: CoupleMember[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
