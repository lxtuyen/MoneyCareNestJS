import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from 'src/modules/user/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserProfile } from 'src/modules/user-profile/entities/user-profile.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import axios from 'axios';
import { GoogleOAuthTokenResponse } from 'src/common/interfaces/google-oauth.interface';
import { GmailToken } from '../gmail/entities/gmail-token.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(GmailToken)
    private readonly gmailTokenRepo: Repository<GmailToken>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<ApiResponse<null>> {
    const exist = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exist) throw new ConflictException('Email đã tồn tại');

    const hash = await bcrypt.hash(dto.password, 10);

    const profile = this.profileRepo.create({
      first_name: dto.firstName,
      last_name: dto.lastName,
    });
    await this.profileRepo.save(profile);

    const user = this.userRepo.create({
      email: dto.email,
      password: hash,
      profile: profile,
      role: dto.role || UserRole.USER,
    });
    await this.userRepo.save(user);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng Ký Tài Khoản Thành Công',
    });
  }

  async login(
    dto: LoginDto,
  ): Promise<ApiResponse<{ accessToken: string; user: any }>> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email },
      relations: ['savingFunds', 'profile'],
    });

    if (!user)
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệp-user');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Mật khẩu không đúng');
    }
    if (!isMatch)
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệismatc');

    const selectedFund = user.savingFunds.find((fund) => fund.is_selected);

    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng nhập thành công',
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          isVip: user.isVip,
          profile: user.profile,
          savingFund: selectedFund || null,
          role: user.role,
        },
      },
    });
  }

  async googleLogin(
    dto: GoogleLoginDto,
  ): Promise<ApiResponse<{ accessToken: string; user: any }>> {
    try {
      const { email, firstName } = dto;

      if (!email) {
        throw new UnauthorizedException('Email không hợp lệ');
      }

      let user = await this.userRepo.findOne({
        where: { email },
        relations: ['profile', 'savingFunds'],
      });

      if (!user) {
        const profile = this.profileRepo.create({
          first_name: firstName ?? '',
          last_name: '',
        });
        await this.profileRepo.save(profile);

        user = this.userRepo.create({
          email,
          profile,
          role: UserRole.USER,
        });

        await this.userRepo.save(user);
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
      const accessToken = this.jwtService.sign(payload);

      const selectedFund = user.savingFunds?.find((f) => f.is_selected) ?? null;

      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Đăng nhập Google thành công',
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            isVip: user.isVip,
            profile: user.profile,
            savingFund: selectedFund,
            role: user.role,
          },
        },
      });
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Đăng nhập Google thất bại');
    }
  }

  async exchangeCode(userId: number, code: string): Promise<void> {
    const response = await axios.post<GoogleOAuthTokenResponse>(
      'https://oauth2.googleapis.com/token',
      {
        code,
        client_id: process.env.CLIENT_ID!,
        client_secret: process.env.CLIENT_SECRET!,
        redirect_uri: process.env.REDIRECT_URI!,
        grant_type: 'authorization_code',
      },
    );

    const data = response.data;

    if (!data.access_token || !data.expires_in) {
      throw new Error('Invalid Google OAuth response');
    }

    await this.gmailTokenRepo.save({
      user: { id: userId } as User,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    });
  }
}
