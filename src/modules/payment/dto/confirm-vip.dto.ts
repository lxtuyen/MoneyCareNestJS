import { IsIn, IsNumber, IsObject, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ConfirmVipDto {
  @Type(() => Number)
  @IsNumber()
  userId: number;

  @IsIn(['google_pay', 'apple_pay'])
  platform: 'google_pay' | 'apple_pay';

  @Type(() => Number)
  @IsNumber()
  amount: number;

  @IsString()
  currency: string;

  @IsObject()
  paymentData: any;
}
