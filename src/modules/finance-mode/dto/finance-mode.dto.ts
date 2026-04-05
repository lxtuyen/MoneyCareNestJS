import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { FinanceModeEnum } from '../entities/finance-mode.entity';

export class UpdateFinanceModeDto {
  @IsEnum(FinanceModeEnum, {
    message: 'mode phải là một trong: NORMAL, SAVING, SURVIVAL',
  })
  mode: FinanceModeEnum;

  @IsOptional()
  @IsDateString()
  suggestionCooldownUntil?: string | null;

  @IsOptional()
  userId?: number;

  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}
