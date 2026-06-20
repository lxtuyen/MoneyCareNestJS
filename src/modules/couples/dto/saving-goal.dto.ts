import {
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  Min,
  IsBoolean,
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

  @IsOptional()
  @IsBoolean()
  is_budget_enabled?: boolean;
}

export class AddContributionDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  amount!: number;

  @IsNumber()
  @IsOptional()
  sourceWalletId?: number;
}

export class UpdateCoupleSavingGoalDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  target?: number;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsBoolean()
  @IsOptional()
  completion_notified?: boolean;

  @IsOptional()
  @IsBoolean()
  is_budget_enabled?: boolean;
}
