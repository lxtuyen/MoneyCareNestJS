import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { UserProfile } from './entities/user-profile.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-user-profile.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class UserProfileService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async updateProfile(
    userId: number,
    dto: UpdateProfileDto,
  ): Promise<ApiResponse<UserProfileResponseDto>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Profile not found');
    }

    Object.assign(user.profile, dto);
    const savedProfile = await this.profileRepo.save(user.profile);
    const responseDto = plainToInstance(UserProfileResponseDto, savedProfile, {
      excludeExtraneousValues: true,
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thành công',
      data: responseDto,
    });
  }
}
