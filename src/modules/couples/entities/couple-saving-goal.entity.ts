import { Couple } from './couple.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';
import { CoupleSavingGoalContribution } from './couple-saving-goal-contribution.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';

@Entity('couple_saving_goals')
export class CoupleSavingGoal {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Wallet, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'walletId' })
  wallet?: Wallet | null;

  @Column({ nullable: true })
  walletId?: number | null;

  @ManyToOne(() => Couple, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'coupleId' })
  couple!: Couple;

  @Column()
  coupleId!: number;

  @Column()
  name!: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  target!: number | null;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  saved_amount!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  end_date!: Date | null;

  @Column({
    type: 'varchar',
    default: 'active',
  })
  status!: string;

  @Column({
    type: 'boolean',
    default: false,
    name: 'completion_notified',
  })
  completion_notified!: boolean;

  @Column({
    type: 'boolean',
    default: false,
    name: 'is_budget_enabled',
  })
  is_budget_enabled!: boolean;

  @OneToMany(
    () => CoupleSavingGoalContribution,
    (contrib) => contrib.savingGoal,
    { cascade: true },
  )
  contributions!: CoupleSavingGoalContribution[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
