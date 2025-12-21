import { IsEmail, IsString } from 'class-validator';

export class DetectTransferDto {
  @IsEmail()
  from: string;

  @IsString()
  subject: string;

  @IsString()
  content: string;
}
