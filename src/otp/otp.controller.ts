import { Body, Controller, Post } from '@nestjs/common';
import { OtpService } from './otp.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('otp')
export class AuthController {
  constructor(private readonly otpService: OtpService) {}

  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.otpService.forgotPassword(email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.otpService.resetPassword(dto.email, dto.newPassword);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otpService.verifyOtp(dto.email, dto.otp);
  }
}
