import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Transaction } from './transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';

@Entity('transaction_splits')
export class TransactionSplit {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Transaction, (transaction) => transaction.splits, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'transactionId' })
  transaction!: Transaction;

  @Column()
  transactionId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  percent!: number | null;
}
