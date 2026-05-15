import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ResolveLocationDto {
  @ApiProperty({ example: 'Cau Giay' })
  @IsString()
  query: string;
}
