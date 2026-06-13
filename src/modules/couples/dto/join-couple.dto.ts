import { IsString, Length, Matches } from 'class-validator';

export class JoinCoupleDto {
  @IsString()
  @Length(6, 6, { message: 'Mã mời phải có đúng 6 ký tự' })
  @Matches(/^[A-Z0-9]+$/, {
    message: 'Mã mời chỉ bao gồm chữ in hoa và chữ số',
  })
  inviteCode!: string;
}
