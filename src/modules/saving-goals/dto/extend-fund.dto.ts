import { IsOptional, IsDateString } from 'class-validator';

export class ExtendFundDto {
  @IsDateString()
  new_end_date: Date;

  @IsOptional()
  @IsDateString()
  new_start_date?: Date;
}
