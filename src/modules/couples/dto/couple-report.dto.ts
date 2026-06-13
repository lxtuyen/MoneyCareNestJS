import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateCoupleAlertDto {
  @IsOptional()
  @IsIn(['open', 'resolved', 'dismissed'])
  status?: 'open' | 'resolved' | 'dismissed';

  @IsOptional()
  @IsIn(['correct', 'incorrect', 'ignored'])
  feedback?: 'correct' | 'incorrect' | 'ignored';

  @IsOptional()
  @IsString()
  note?: string;
}
