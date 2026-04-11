import { IsOptional, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  monthlyIncome?: number;

  @IsOptional()
  @IsString()
  incomeDate?: string;

  @IsOptional()
  @IsString()
  avatar?: string;
}
