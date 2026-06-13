import { IsNumber, IsString, IsNotEmpty, Matches } from 'class-validator';

export class SetCoupleBudgetDto {
  @IsNumber()
  @IsNotEmpty()
  categoryId!: number;

  @IsNumber()
  @IsNotEmpty()
  amount!: number;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}$/, { message: 'Tháng phải có định dạng YYYY-MM' })
  month!: string;

  @IsNumber()
  @IsNotEmpty()
  coupleId!: number;
}
