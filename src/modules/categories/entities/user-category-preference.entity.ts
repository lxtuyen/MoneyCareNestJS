import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from './category.entity';

@Entity('user_category_preferences')
@Unique(['user', 'category'])
export class UserCategoryPreference {
  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(() => User, (user) => user.categoryPreferences, {
    onDelete: 'CASCADE',
  })
  user!: User;

  @ManyToOne(() => Category, {
    eager: true,
    onDelete: 'CASCADE',
  })
  category!: Category;

  @Column({ default: true })
  isEssential!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
