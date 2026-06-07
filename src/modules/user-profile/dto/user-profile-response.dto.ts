import { Expose } from 'class-transformer';

export class UserProfileResponseDto {
  @Expose()
  id!: number;

  @Expose()
  first_name?: string;

  @Expose()
  last_name?: string;

  @Expose()
  avatar?: string;
}
