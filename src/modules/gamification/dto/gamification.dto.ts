import { IsDateString, IsOptional } from 'class-validator';

export class RecordDayDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}
