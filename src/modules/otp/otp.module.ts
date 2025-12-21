import { Module } from '@nestjs/common';
import { OtpService } from './otp.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OTP } from './entities/otp.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { MailModule } from 'src/modules/mailer/mail.module';
import { AuthController } from './otp.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OTP, User]), MailModule],
  providers: [OtpService],
  controllers: [AuthController],
})
export class OtpModule {}
