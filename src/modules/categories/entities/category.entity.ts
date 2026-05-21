import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  UpdateDateColumn,
  CreateDateColumn,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { SubCategory } from './sub-category.entity';
import { CategoryType } from './category-type.enum';

export { CategoryType } from './category-type.enum';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column({ nullable: true })
  icon!: string;

  @Column({ type: 'enum', enum: CategoryType, default: CategoryType.EXPENSE })
  type!: CategoryType;

  @Column({ default: true })
  isEssential!: boolean;

  @Column({ default: false })
  is_system!: boolean;

  @ManyToOne(() => User, (user) => user.categories, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  user!: User | null;

  @OneToMany(() => Transaction, (trans) => trans.category)
  transactions!: Transaction[];

  @OneToMany(() => SubCategory, (subCategory) => subCategory.category)
  subCategories!: SubCategory[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @DeleteDateColumn()
  deleted_at?: Date;
}
