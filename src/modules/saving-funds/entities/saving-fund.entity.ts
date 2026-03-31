import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';

@Entity('saving_funds')
export class SavingFund {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  budget: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  target: number;

  @Column({ type: 'timestamp', nullable: true })
  start_date: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_date: Date;

  @Column({
    type: 'enum',
    enum: ['ACTIVE', 'EXPIRED', 'COMPLETED', 'ARCHIVED'],
    default: 'ACTIVE',
  })
  status: string;

  @Column({ default: false })
  completion_notified: boolean;

  @Column({ default: false })
  is_selected: boolean;

  @ManyToOne(() => User, (user) => user.savingFunds, { onDelete: 'CASCADE' })
  user: User;

  @OneToMany(() => Category, (category) => category.savingFund)
  categories: Category[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
