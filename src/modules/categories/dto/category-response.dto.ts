import { Expose } from 'class-transformer';
import { CategoryType } from '../entities/category.entity';

export class SubCategoryResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  icon: string;

  @Expose()
  type: CategoryType;

  @Expose()
  is_system: boolean;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}

export class CategoryResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  icon: string;

  @Expose()
  type: CategoryType;

  @Expose()
  isEssential: boolean;

  @Expose()
  subCategories?: SubCategoryResponseDto[];

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
