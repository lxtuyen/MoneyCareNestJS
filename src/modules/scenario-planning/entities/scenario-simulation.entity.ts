import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';

@Entity('scenario_simulations')
export class ScenarioSimulation {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column()
  scenarioType!: string;

  @Column({ type: 'jsonb' })
  inputPayload!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  resultPayload!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
