import { IsOptional, IsString } from 'class-validator';

export class SubscribeDto {
  @IsString()
  @IsOptional()
  returnUrl?: string;

  @IsString()
  @IsOptional()
  cancelUrl?: string;
}
