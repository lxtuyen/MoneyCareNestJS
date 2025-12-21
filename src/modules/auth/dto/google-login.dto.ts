import { IsOptional, IsString } from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  email: string;

  @IsOptional()
  @IsString()
  firstName?: string;
}
