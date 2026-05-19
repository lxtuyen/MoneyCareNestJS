import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Category } from './category.entity';
import { CategoryType } from './category-type.enum';

@Entity('sub_categories')
export class SubCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  icon: string;

  @Column({ type: 'enum', enum: CategoryType, default: CategoryType.EXPENSE })
  type: CategoryType;

  @Column({ default: true })
  is_system: boolean;

  @ManyToOne(() => Category, (category) => category.subCategories, {
    onDelete: 'CASCADE',
  })
  category: Category;

  @OneToMany(() => Transaction, (transaction) => transaction.subCategory)
  transactions: Transaction[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
