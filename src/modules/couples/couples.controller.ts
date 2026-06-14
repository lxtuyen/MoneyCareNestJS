import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { CouplesService } from './couples.service';
import { JoinCoupleDto } from './dto/join-couple.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';
import { FileInterceptor } from '@nestjs/platform-express';
import { CloudinaryService } from './cloudinary.service';

@Controller('couples')
@UseGuards(JwtAuthGuard)
export class CouplesController {
  constructor(
    private readonly couplesService: CouplesService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Không tìm thấy tệp tải lên');
    }
    try {
      const result = await this.cloudinaryService.uploadFile(file);
      return ok({ url: result.secure_url }, 'Tải ảnh lên thành công');
    } catch (error: any) {
      throw new BadRequestException(
        `Không thể tải ảnh lên Cloudinary: ${error.message || error}`,
      );
    }
  }

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
