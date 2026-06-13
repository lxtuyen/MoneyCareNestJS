import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';

export class CreateCoupleSavingGoalDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  target!: number;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsNumber()
  @IsNotEmpty()
  coupleId!: number;
}

export class AddContributionDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  amount!: number;
}
