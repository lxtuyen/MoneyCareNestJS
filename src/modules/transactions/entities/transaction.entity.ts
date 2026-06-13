import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { Couple } from 'src/modules/couples/entities/couple.entity';
import { TransactionSplit } from './transaction-split.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  amount!: number;

  @Column({ type: 'enum', enum: ['income', 'expense'] })
  type!: 'income' | 'expense';

  @Column({ type: 'timestamp with time zone', nullable: true })
  transaction_date!: Date;

  @Column({ nullable: true })
  note!: string;

  @Column({ nullable: true })
  pictureURL!: string;

  @Column({ default: false })
  isTransfer!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @ManyToOne(() => User, (user) => user.transactions, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Category, (category) => category.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  category?: Category | null;

  @ManyToOne(() => SubCategory, (subCategory) => subCategory.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  subCategory?: SubCategory | null;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  wallet?: Wallet | null;

  @ManyToOne(() => Couple, { onDelete: 'SET NULL', nullable: true })
  couple?: Couple | null;

  @Column({ type: 'int', nullable: true })
  coupleId?: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  payer?: User | null;

  @Column({ type: 'int', nullable: true })
  payerId?: number | null;

  @Column({ type: 'varchar', default: 'none' })
  splitMethod!: string; // 'none', 'equal', 'percentage', 'fixed'

  @Column({ type: 'varchar', nullable: true })
  settlementStatus?: string | null; // 'unsettled', 'settled', null for non-split

  @Column({ type: 'timestamp with time zone', nullable: true })
  settledAt?: Date | null;

  @Column({ type: 'int', nullable: true })
  settledById?: number | null;

  @OneToMany(() => TransactionSplit, (split) => split.transaction, {
    cascade: true,
  })
  splits!: TransactionSplit[];
}
