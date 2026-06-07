import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { PersonalizationService } from './personalization.service';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { plainToInstance } from 'class-transformer';
import { PersonalFinanceProfileResponseDto } from './dto/personal-finance-profile-response.dto';

@Controller('personalization')
@UseGuards(JwtAuthGuard)
export class PersonalizationController {
  constructor(
    private readonly personalizationService: PersonalizationService,
  ) {}

  @Get('profile')
  async getProfile(
    @User('sub') userId: number,
  ): Promise<ApiResponse<PersonalFinanceProfileResponseDto>> {
    const profile = await this.personalizationService.getOrBuildProfile(userId);
    const data = plainToInstance(PersonalFinanceProfileResponseDto, profile, {
      excludeExtraneousValues: true,
    });
    return ok(data, 'Lấy hồ sơ tài chính cá nhân thành công');
  }

  @Post('profile/rebuild')
  async rebuildProfile(
    @User('sub') userId: number,
  ): Promise<ApiResponse<PersonalFinanceProfileResponseDto>> {
    const profile = await this.personalizationService.rebuildProfile(userId);
    const data = plainToInstance(PersonalFinanceProfileResponseDto, profile, {
      excludeExtraneousValues: true,
    });
    return ok(data, 'Tính toán lại hồ sơ tài chính thành công');
  }

  @Get('profile/summary')
  async getProfileSummary(
    @User('sub') userId: number,
  ): Promise<ApiResponse<any>> {
    const summary = await this.personalizationService.getProfileSummary(userId);
    return ok(summary, 'Lấy tóm tắt hồ sơ tài chính thành công');
  }
}
