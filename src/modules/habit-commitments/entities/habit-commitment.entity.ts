import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';

@Entity('habit_commitments')
@Unique(['user', 'habitName', 'month', 'year'])
export class HabitCommitment {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;

  @Column({ type: 'int' })
  userId!: number;

  @ManyToOne(() => SavingGoal, { nullable: true, onDelete: 'SET NULL' })
  goal!: SavingGoal | null;

  @Column({ type: 'int', nullable: true })
  goalId!: number | null;

  /** Tên thói quen hiển thị: "Cafe", "Trà sữa", ... */
  @Column()
  habitName!: string;

  /** Tên sub_category trong DB để match giao dịch */
  @Column()
  subcategoryName!: string;

  /** Số lần cam kết tối đa trong tháng */
  @Column({ type: 'int' })
  committedCount!: number;

  /** Số tiền tiết kiệm tiềm năng khi giảm theo cam kết */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  potentialSavings!: number;

  /** Giá trung bình mỗi lần chi */
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  avgPerTransaction!: number;

  /** Số lần dự báo nếu không giảm */
  @Column({ type: 'int', default: 0 })
  projectedCount!: number;

  /** Tháng áp dụng (1-12) */
  @Column({ type: 'int' })
  month!: number;

  /** Năm áp dụng */
  @Column({ type: 'int' })
  year!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
