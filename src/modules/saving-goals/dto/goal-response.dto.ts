import { Expose, Type } from 'class-transformer';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';

export class SavingGoalResponseDto {
  @Expose()
  id: number;

  @Expose()
  name: string;

  @Expose()
  target: number;

  @Expose()
  saved_amount: number;

  @Expose()
  start_date: Date;

  @Expose()
  end_date: Date;

  @Expose()
  @Type(() => Wallet)
  wallet: Wallet;



  @Expose()
  created_at: Date;

  @Expose()
  updated_at: Date;
}
