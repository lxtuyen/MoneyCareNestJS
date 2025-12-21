import { Expose } from 'class-transformer';

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
  created_at: Date;

  @Expose()
  updated_at: Date;
}
