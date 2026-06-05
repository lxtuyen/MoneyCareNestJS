import { User } from 'src/modules/user/entities/user.entity';
import { AiPredictionRun } from './ai-prediction-run.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ai_prediction_evaluations')
@Index(['userId'])
@Index(['evaluatedAt'])
export class AiPredictionEvaluation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => AiPredictionRun, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'predictionRunId' })
  predictionRun!: AiPredictionRun;

  @Column()
  predictionRunId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  actualPayload!: Record<string, any>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metrics!: Record<string, any>;

  @Column({ type: 'float', nullable: true })
  mae!: number | null;

  @Column({ type: 'float', nullable: true })
  rmse!: number | null;

  @Column({ type: 'float', nullable: true })
  mape!: number | null;

  @Column({ type: 'float', nullable: true })
  directionalAccuracy!: number | null;

  @Column({ type: 'timestamp with time zone', default: () => 'CURRENT_TIMESTAMP' })
  evaluatedAt!: Date;

  @CreateDateColumn()
  createdAt!: Date;
}
