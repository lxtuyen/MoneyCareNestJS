import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserProfileService } from './user-profile.service';
import { UpdateProfileDto } from './dto/update-user-profile.dto';
import { User } from 'src/decorators/user.decorator';

@Controller('user-profile')
@UseGuards(JwtAuthGuard)
export class UserProfileController {
  constructor(private readonly profileService: UserProfileService) {}

  @Get('me')
  getMyProfile(@User('sub') userId: number) {
    return this.profileService.getProfile(userId);
  }

  @Patch('me')
  updateMyProfile(@User('sub') userId: number, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(userId, dto);
  }
}
