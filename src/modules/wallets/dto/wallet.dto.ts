import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  name: string;

  @IsNumber()
  @IsOptional()
  balance?: number;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;
}

export class UpdateWalletDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

}

export class TransferDto {
  @IsNumber()
  fromWalletId: number;

  @IsNumber()
  toWalletId: number;

  @IsNumber()
  amount: number;

  @IsNumber()
  @IsOptional()
  fee?: number;

  @IsString()
  @IsOptional()
  note?: string;

  @IsNumber()
  @IsOptional()
  categoryId?: number;
}
