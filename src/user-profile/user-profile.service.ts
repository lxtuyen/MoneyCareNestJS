import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { User } from 'src/user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-user-profile.dto';
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
  ): Promise<ApiResponse<User>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Profile not found');
    }
    if (dto.monthlyIncome !== undefined) {
      user.profile.monthly_income = dto.monthlyIncome;
    }
    if (dto.firstName !== undefined) {
      user.profile.first_name = dto.firstName;
    }
    if (dto.lastName !== undefined) {
      user.profile.last_name = dto.lastName;
    }

    await this.profileRepo.save(user.profile);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: user,
      message: 'Cập nhật thành công',
    });
  }
}
