import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  balance?: number;

  @IsNumber()
  @IsOptional()
  coupleId?: number;
}

export class UpdateWalletDto {
  @IsString()
  @IsOptional()
  name?: string;

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

  @IsString()
  @IsOptional()
  note?: string;

  @IsNumber()
  @IsOptional()
  categoryId?: number;
}
