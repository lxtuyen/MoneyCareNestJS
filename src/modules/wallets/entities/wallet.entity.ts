import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Couple } from 'src/modules/couples/entities/couple.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  balance!: number;

  @Column({ default: true })
  is_active!: boolean;

  @ManyToOne(() => User, (user) => user.wallets, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  user?: User | null;

  @ManyToOne(() => Couple, { onDelete: 'CASCADE', nullable: true })
  couple?: Couple | null;

  @Column({ nullable: true })
  coupleId?: number | null;

  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions!: Transaction[];

  @OneToMany(() => SavingGoal, (goal) => goal.wallet)
  savingGoals!: SavingGoal[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
