import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDeviceTokenDto {
  @ApiProperty({ description: 'The FCM device token assigned by Firebase' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
