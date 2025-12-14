import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendOtpEmail(to: string, otp: string) {
    await this.mailerService.sendMail({
      to,
      subject: 'Mã OTP xác thực tài khoản',
      template: 'otp',
      context: { otp },
    });
  }
}
