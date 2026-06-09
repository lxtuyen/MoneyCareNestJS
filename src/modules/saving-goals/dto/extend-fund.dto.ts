import { IsOptional, IsDateString } from 'class-validator';

export class ExtendFundDto {
  @IsDateString()
  new_end_date: string;

  @IsOptional()
  @IsDateString()
  new_start_date?: string;
}
