import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google-login')
  googleLogin(@Body() dto: GoogleLoginDto) {
    return this.authService.googleLogin(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('google/gmail/connect')
  async connectGmail(
    @User('sub') userId: number,
    @Body('code') code: string,
  ): Promise<ApiResponse<null>> {
    await this.authService.exchangeCode(userId, code);

    return new ApiResponse({
      success: true,
      message: 'Đã kết nối Gmail',
    });
  }
}
