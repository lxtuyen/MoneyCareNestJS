import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateHabitCommitmentDto {
  @IsOptional()
  @IsInt()
  goalId?: number;

  @IsNotEmpty()
  @IsString()
  habitName!: string;

  @IsNotEmpty()
  @IsString()
  subcategoryName!: string;

  @IsInt()
  @Min(1)
  committedCount!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  potentialSavings?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  avgPerTransaction?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  projectedCount?: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsInt()
  @Min(2020)
  year!: number;
}
