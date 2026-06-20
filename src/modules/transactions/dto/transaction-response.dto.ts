import { Expose, Type } from 'class-transformer';
import { CategoryResponseDto } from 'src/modules/categories/dto/category-response.dto';
import { SubCategoryResponseDto } from 'src/modules/categories/dto/category-response.dto';

export class TransactionResponseDto {
  @Expose()
  id: number;

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
  @Type(() => SubCategoryResponseDto)
  subCategory?: SubCategoryResponseDto;

  @Expose()
  wallet?: {
    id: number;
    name: string;
    balance: number;
    coupleId?: number | null;
  } | null;

  @Expose()
  coupleId?: number | null;

  @Expose()
  payerId?: number | null;

  @Expose()
  payerName?: string | null;

  @Expose()
  creatorId?: number | null;

  @Expose()
  creatorName?: string | null;

  @Expose()
  isTransfer!: boolean;

  @Expose()
  created_at!: Date;

  @Expose()
  updated_at: Date;
}
