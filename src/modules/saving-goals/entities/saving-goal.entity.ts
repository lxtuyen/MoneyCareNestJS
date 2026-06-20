import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';
import { SavingGoalStatus } from '../enums/saving-goal-status.enum';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';

@Entity('saving_goals')
export class SavingGoal {
  @PrimaryGeneratedColumn()
  id!: number;

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

  @Column({ default: false })
  is_completed!: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  start_date!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  end_date!: Date | null;

  @Column({
    type: 'enum',
    enum: SavingGoalStatus,
    default: SavingGoalStatus.PAUSED,
  })
  status!: SavingGoalStatus;

  @Column({ default: false })
  completion_notified!: boolean;

  @Column({ default: false })
  is_selected!: boolean;

  @Column({ default: false, name: 'is_budget_enabled' })
  is_budget_enabled!: boolean;



  @ManyToOne(() => User, (user) => user.savingGoals, { onDelete: 'CASCADE' })
  user!: User;

  @ManyToOne(() => Wallet, { nullable: false, onDelete: 'CASCADE' })
  wallet!: Wallet;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
