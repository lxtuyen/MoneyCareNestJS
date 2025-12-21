import { SavingFund } from 'src/modules/saving-funds/entities/saving-fund.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  UpdateDateColumn,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ type: 'float', default: 0 })
  percentage: number;

  @ManyToOne(() => SavingFund, (fund) => fund.categories, {
    onDelete: 'CASCADE',
  })
  savingFund: SavingFund;

  @OneToMany(() => Transaction, (trans) => trans.category)
  transactions: Transaction[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
