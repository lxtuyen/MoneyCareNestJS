import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CouplesService } from './couples.service';
import { JoinCoupleDto } from './dto/join-couple.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';

@Controller('couples')
@UseGuards(JwtAuthGuard)
export class CouplesController {
  constructor(private readonly couplesService: CouplesService) {}

  @Post()
  async create(@User('sub') userId: number) {
    const data = await this.couplesService.create(userId);
    return ok(data, 'Tạo không gian cặp đôi thành công');
  }

  @Post('join')
  @HttpCode(HttpStatus.OK)
  async join(@User('sub') userId: number, @Body() dto: JoinCoupleDto) {
    const data = await this.couplesService.join(userId, dto.inviteCode);
    return ok(data, 'Kết nối không gian cặp đôi thành công');
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  async cancelInvite(@User('sub') userId: number) {
    await this.couplesService.cancelInvite(userId);
    return ok(null, 'Hủy lời mời kết nối thành công');
  }

  @Post('leave')
  @HttpCode(HttpStatus.OK)
  async leaveCouple(@User('sub') userId: number) {
    await this.couplesService.leaveCouple(userId);
    return ok(null, 'Rời không gian cặp đôi thành công');
  }

  @Get('me')
  async getMe(@User('sub') userId: number) {
    const data = await this.couplesService.getMe(userId);
    return ok(data, 'Lấy thông tin cặp đôi hiện tại thành công');
  }

  @Patch('settings')
  async updateSettings(
    @User('sub') userId: number,
    @Body() dto: UpdateSettingsDto,
  ) {
    const data = await this.couplesService.updateSettings(userId, dto);
    return ok(data, 'Cập nhật thiết lập quyền riêng tư thành công');
  }
}
