import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Place } from './place.entity';

@Entity('place_checkins')
export class PlaceCheckin {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  transaction: Transaction;

  @ManyToOne(() => Place, (place) => place.checkins, { onDelete: 'CASCADE' })
  place: Place;

  @Column()
  amount: number;

  @Column({ type: 'int' })
  rating: number;

  @Column({ default: false })
  wantToReturn: boolean;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'simple-json', nullable: true })
  tags?: string[] | null;

  @Column({ type: 'timestamp with time zone' })
  visitedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
