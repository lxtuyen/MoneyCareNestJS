import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

export enum FinanceModeEnum {
  NORMAL = 'NORMAL',
  SAVING = 'SAVING',
  SURVIVAL = 'SURVIVAL',
}

@Entity('finance_mode')
export class FinanceModeEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  userId: number;

  @Column({
    type: 'enum',
    enum: FinanceModeEnum,
    default: FinanceModeEnum.NORMAL,
  })
  mode: FinanceModeEnum;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  suggestionCooldownUntil: Date | null;
}
