import { IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class BadgeDto {
  @IsString()
  key!: string;

  @IsString()
  name!: string;

  @IsString()
  awardedAt!: string;
}

export class RecordDayDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BadgeDto)
  badge?: BadgeDto;
}
