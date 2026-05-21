import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
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
}
