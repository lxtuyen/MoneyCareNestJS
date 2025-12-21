import { Expose, Type } from 'class-transformer';
import { CategoryResponseDto } from 'src/modules/categories/dto/category-response.dto';

export class SavingFundResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  @Type(() => CategoryResponseDto)
  categories?: CategoryResponseDto[];

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
