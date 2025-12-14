import { HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { OTP } from './entities/otp.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { MailService } from 'src/mailer/mail.service';
import { randomInt } from 'crypto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OTP)
    private readonly otpRepo: Repository<OTP>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  private async createOtpForUser(user: User): Promise<string> {
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 60 * 1000);

    const otp = this.otpRepo.create({
      code,
      expires_at: expiresAt,
      user,
    });
    await this.otpRepo.save(otp);

    await this.mailService.sendOtpEmail(user.email, code);
    return code;
  }

  async forgotPassword(email: string): Promise<ApiResponse<null>> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Không tìm thấy người dùng');

    await this.createOtpForUser(user);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'OTP đã được gửi tới email của bạn',
    });
  }

  async resetPassword(
    email: string,
    newPassword: string,
  ): Promise<ApiResponse<null>> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Không tìm thấy người dùng');

    user.password = newPassword;
    await this.userRepo.save(user);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đổi mật khẩu thành công',
    });
  }

  async verifyOtp(email: string, code: string): Promise<ApiResponse<null>> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('Không tìm thấy người dùng');

    const otp = await this.otpRepo.findOne({
      where: { user: { id: user.id }, code },
      order: { created_at: 'DESC' },
    });

    if (!otp) throw new UnauthorizedException('OTP không hợp lệ');
    if (otp.expires_at < new Date())
      throw new UnauthorizedException('OTP đã hết hạn');

    await this.otpRepo.remove(otp);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xác thực thành công',
    });
  }
}
