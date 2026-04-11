import { IsNumber, IsOptional, IsString } from 'class-validator';

export class ChatDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsNumber()
  userId: number;
}
