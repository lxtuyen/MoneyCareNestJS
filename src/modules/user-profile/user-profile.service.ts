import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from './entities/user-profile.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { UpdateProfileDto } from './dto/update-user-profile.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { UpdateMonthlyIncomeDto } from './dto/update-income-monthly.dto';

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
      relations: ['profile'],
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Profile not found');
    }

    Object.assign(user.profile, dto);
    const savedProfile = await this.profileRepo.save(user.profile);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thành công',
      data: savedProfile,
    });
  }

  async updateMonthlyIncome(
    userId: number,
    dto: UpdateMonthlyIncomeDto,
  ): Promise<ApiResponse<any>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });

    if (!user || !user.profile) {
      throw new NotFoundException('Profile not found');
    }

    user.profile.monthly_income = dto.monthly_income;

    const savedProfile = await this.profileRepo.save(user.profile);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật thu nhập hàng tháng thành công',
      data: savedProfile,
    });
  }
}
