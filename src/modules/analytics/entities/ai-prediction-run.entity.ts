import { User } from 'src/modules/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('ai_prediction_runs')
@Index(['userId', 'modelType', 'modelName', 'createdAt'])
@Index(['status'])
@Index(['predictionTargetEnd'])
@Index(['coupleId', 'modelType', 'createdAt'])
export class AiPredictionRun {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ type: 'int', nullable: true })
  coupleId!: number | null;

  @Column({
    type: 'enum',
    enum: ['forecasting', 'budgeting', 'categorization', 'couple_forecasting'],
  })
  modelType!: 'forecasting' | 'budgeting' | 'categorization' | 'couple_forecasting';

  @Column({ type: 'varchar', length: 100 })
  modelName!: string;

  @Column({ type: 'varchar', length: 20, default: 'v1' })
  modelVersion!: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  inputPeriodStart!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  inputPeriodEnd!: Date;

  @Column({ type: 'timestamp with time zone' })
  predictionTargetStart!: Date;

  @Column({ type: 'timestamp with time zone' })
  predictionTargetEnd!: Date;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  predictionPayload!: Record<string, any>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  inputSnapshot!: Record<string, any>;

  @Column({ type: 'float', default: 0 })
  confidence!: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'evaluated', 'expired', 'skipped'],
    default: 'pending',
  })
  status!: 'pending' | 'evaluated' | 'expired' | 'skipped';

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
