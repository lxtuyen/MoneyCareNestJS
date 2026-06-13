import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  sharePersonalTransactions?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAiShare?: boolean;
}
