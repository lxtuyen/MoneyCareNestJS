import { AuthService } from './../auth/auth.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OTP } from './entities/otp.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';
import { MailService } from 'src/mail/mail.service';
import { randomInt } from 'crypto';

@Injectable()
export class OtpService {
  constructor(
    @InjectRepository(OTP)
    private readonly otpRepo: Repository<OTP>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly mailService: MailService,
    private readonly authService: AuthService,
  ) {}

  private async createOtpForUser(user: User): Promise<string> {
    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 phút

    const otp = this.otpRepo.create({
      code,
      expires_at: expiresAt,
      user,
    });
    await this.otpRepo.save(otp);

    await this.mailService.sendOtpEmail(user.email, code);
    return code;
  }

  async forgotPassword(email: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User not found');

    await this.createOtpForUser(user);
    return { message: 'OTP đã được gửi tới email của bạn' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User not found');

    const otp = await this.otpRepo.findOne({
      where: { user: { id: user.id }, code },
      order: { created_at: 'DESC' },
    });

    if (!otp) throw new UnauthorizedException('OTP không hợp lệ');
    if (otp.expires_at < new Date())
      throw new UnauthorizedException('OTP đã hết hạn');

    user.password = newPassword;
    await this.userRepo.save(user);

    await this.otpRepo.remove(otp);

    return { message: 'Đổi mật khẩu thành công' };
  }

  async verifyOtp(email: string, code: string) {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new UnauthorizedException('User not found');

    const otp = await this.otpRepo.findOne({
      where: { user: { id: user.id }, code },
      order: { created_at: 'DESC' },
    });

    if (!otp) throw new UnauthorizedException('OTP không hợp lệ');
    if (otp.expires_at < new Date())
      throw new UnauthorizedException('OTP đã hết hạn');

    await this.userRepo.save(user);
    await this.otpRepo.remove(otp);

    return this.authService.generateToken(user);
  }
}
