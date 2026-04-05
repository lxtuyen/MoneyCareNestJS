import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ExamPeriodDto {
  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;
}

export class UpsertStudentProfileDto {
  @IsOptional()
  @IsString()
  university?: string;

  @IsOptional()
  @IsString()
  faculty?: string;

  @IsOptional()
  @IsInt()
  @Min(1, { message: 'Năm học phải từ 1 đến 6' })
  @Max(6, { message: 'Năm học phải từ 1 đến 6' })
  studyYear?: number;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Thu nhập không hợp lệ' })
  monthlyIncome?: number;

  @IsOptional()
  @IsDateString()
  incomeDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamPeriodDto)
  examPeriods?: ExamPeriodDto[];
}
