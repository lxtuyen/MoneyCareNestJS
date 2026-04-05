import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface ExamPeriod {
  startDate: string; // ISO date string
  endDate: string;   // ISO date string
}

@Entity('student_profile')
export class StudentProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  @Column({ nullable: true })
  university: string;

  @Column({ nullable: true })
  faculty: string;

  @Column({ nullable: true })
  studyYear: number;

  @Column({ type: 'bigint', nullable: true })
  monthlyIncome: number;

  @Column({ type: 'date', nullable: true })
  incomeDate: string;

  @Column({ type: 'jsonb', default: [] })
  examPeriods: ExamPeriod[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
