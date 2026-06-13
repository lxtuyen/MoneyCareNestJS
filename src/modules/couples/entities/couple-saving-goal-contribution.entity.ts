import { CoupleSavingGoal } from './couple-saving-goal.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from 'src/common/transformers/decimal.transformer';

@Entity('couple_saving_goal_contributions')
export class CoupleSavingGoalContribution {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => CoupleSavingGoal, (goal) => goal.contributions, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'savingGoalId' })
  savingGoal!: CoupleSavingGoal;

  @Column()
  savingGoalId!: number;

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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
