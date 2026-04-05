import { Expose } from 'class-transformer';
import { CategoryType } from '../entities/category.entity';

export class CategoryResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  icon: string;

  @Expose()
  percentage: number;

  @Expose()
  type: CategoryType;

  @Expose()
  isEssential: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
