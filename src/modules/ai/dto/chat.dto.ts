import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ChatDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsNumber()
  userId: number;

  @IsOptional()
  @IsString()
  ocrText?: string;

  @IsOptional()
  @IsString()
  ocrLines?: string;

  @IsOptional()
  @IsNumber()
  goalId?: number;

  @IsOptional()
  @IsNumber()
  forecastedSaving?: number;
}
