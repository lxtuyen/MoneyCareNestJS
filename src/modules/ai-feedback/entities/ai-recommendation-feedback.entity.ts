import { User } from 'src/modules/user/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AiRecommendationType =
  | 'budget'
  | 'category'
  | 'saving_goal'
  | 'forecast_insight'
  | 'chatbot';

export type AiFeedbackAction =
  | 'accepted'
  | 'modified'
  | 'rejected'
  | 'dismissed'
  | 'corrected'
  | 'helpful'
  | 'not_helpful';

export type AiFeedbackDataSource = 'real' | 'synthetic';

@Entity('ai_recommendation_feedback')
@Index(['userId'])
@Index(['recommendationType'])
@Index(['recommendationId'])
@Index(['userAction'])
@Index(['createdAt'])
@Index(['userId', 'recommendationType', 'createdAt'])
@Index(['userId', 'recommendationId'])
export class AiRecommendationFeedback {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column()
  userId!: number;

  @Column({
    type: 'enum',
    enum: ['budget', 'category', 'saving_goal', 'forecast_insight', 'chatbot'],
  })
  recommendationType!: AiRecommendationType;

  @Column({ type: 'varchar', length: 160 })
  recommendationId!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sourceModel!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  sourceModelVersion!: string | null;

  @Column({
    type: 'enum',
    enum: [
      'accepted',
      'modified',
      'rejected',
      'dismissed',
      'corrected',
      'helpful',
      'not_helpful',
    ],
  })
  userAction!: AiFeedbackAction;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  sourcePayload!: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  modifiedPayload!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  contextPayload!: Record<string, any> | null;

  @Column({
    type: 'enum',
    enum: ['real', 'synthetic'],
    default: 'real',
  })
  dataSource!: AiFeedbackDataSource;

  @Column({ type: 'jsonb', nullable: true })
  outcomePayload!: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  outcomeMeasuredAt!: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reasonText!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
