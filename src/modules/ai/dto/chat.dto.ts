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
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;
}
