import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { User } from 'src/modules/user/entities/user.entity';
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
  ): Promise<ApiResponse<any>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile', 'savingFunds'],
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Profile not found');
    }

    Object.assign(user.profile, dto);
    await this.profileRepo.save(user.profile);

    const selectedFund = user.savingFunds.find((fund) => fund.is_selected);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thành công',
      data: {
        user: {
          id: user.id,
          email: user.email,
          profile: user.profile,
          savingFund: selectedFund || null,
          role: user.role,
        },
      },
    });
  }
}
