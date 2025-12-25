import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { UserProfileService } from './user-profile.service';
import { UpdateProfileDto } from './dto/update-user-profile.dto';
import { User } from 'src/common/decorators/user.decorator';
import { UpdateMonthlyIncomeDto } from './dto/update-income-monthly.dto';

@Controller('user-profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly profileService: UserProfileService) {}

  @Patch('me')
  updateMyProfile(@User('sub') userId: number, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(userId, dto);
  }

  @Patch('monthly-income')
  updateMonthlyIncome(
    @User('sub') userId: number,
    @Body() dto: UpdateMonthlyIncomeDto,
  ) {
    return this.profileService.updateMonthlyIncome(userId, dto);
  }
}
