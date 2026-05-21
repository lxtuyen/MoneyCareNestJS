import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendOtpEmail(to: string, otp: string) {
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Mã OTP xác thực tài khoản',
        template: 'otp',
        context: { otp },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send OTP email to ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException('Không thể gửi email OTP');
    }
  }

  async sendEmailWithAttachment(
    to: string,
    subject: string,
    html: string,
    attachments: any[],
  ) {
    try {
      await this.mailerService.sendMail({
        to,
        subject,
        template: 'generic',
        context: {
          content: html,
        },
        attachments,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send email with attachment to ${to}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Không thể gửi email kèm tệp đính kèm',
      );
    }
  }
}
