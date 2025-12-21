import { Expose, Type } from 'class-transformer';
import { CategoryResponseDto } from 'src/modules/categories/dto/category-response.dto';

export class TransactionResponseDto {
  @Expose()
  amount: number;

  @Expose()
  type: 'income' | 'expense';

  @Expose()
  note?: string;

  @Expose({ name: 'transaction_date' })
  transactionDate: string;

  @Expose()
  @Type(() => CategoryResponseDto)
  category?: CategoryResponseDto;

  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
