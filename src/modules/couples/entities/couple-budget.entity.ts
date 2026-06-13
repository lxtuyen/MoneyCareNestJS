import { Couple } from './couple.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
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

@Entity('couple_budgets')
export class CoupleBudget {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => Couple, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'coupleId' })
  couple!: Couple;

  @Column()
  coupleId!: number;

  @ManyToOne(() => Category, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'categoryId' })
  category!: Category;

  @Column()
  categoryId!: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  amount!: number;

  @Column()
  month!: string; // format 'YYYY-MM'

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
