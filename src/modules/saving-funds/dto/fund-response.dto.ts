import { Expose, Type } from 'class-transformer';
import { CategoryResponseDto } from 'src/modules/categories/dto/category-response.dto';

export class FundResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  balance: number;

  @Expose()
  target: number;

  @Expose()
  start_date: Date;

  @Expose()
  end_date: Date;

  @Expose()
  @Type(() => CategoryResponseDto)
  categories?: CategoryResponseDto[];

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
