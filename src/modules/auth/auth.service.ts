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
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    this.googleClient = new OAuth2Client(clientId);
  }

  async register(dto: RegisterDto): Promise<ApiResponse<null>> {
    const exist = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exist) throw new ConflictException('Email đã tồn tại');

    const hash = await bcrypt.hash(dto.password, 10);

    const profile = this.profileRepo.create({
      first_name: dto.firstName,
      last_name: dto.lastName,
      avatar: 'https://i.pinimg.com/736x/0d/64/98/0d64989794b1a4c9d89bff571d3d5842.jpg',
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
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.funds', 'funds')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.categories', 'categories')
      .addSelect('user.password')
      .where('user.email = :email', { email: dto.email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');
    }

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');
    }

    const selectedFund = user.funds.find((fund) => fund.is_selected);

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
          fund: selectedFund || null,
          hasCategories: user.categories?.length > 0,
          role: user.role,
        },
      },
    });
  }

  async googleLogin(
    dto: GoogleLoginDto,
  ): Promise<ApiResponse<{ accessToken: string; user: any }>> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.idToken,
      });
      const payload = ticket.getPayload();
      const email = payload?.email;
      const firstName = payload?.given_name || payload?.name;
      const lastName = payload?.family_name;

      if (!email) {
        throw new UnauthorizedException('Không lấy được email từ Google');
      }

      let user = await this.userRepo.findOne({
        where: { email },
        relations: ['profile', 'funds', 'categories'],
      });

      if (!user) {
        const profile = this.profileRepo.create({
          first_name: firstName ?? '',
          last_name: '',
          avatar:
            payload?.picture ||
            'https://i.pinimg.com/736x/0d/64/98/0d64989794b1a4c9d89bff571d3d5842.jpg',
        });
        await this.profileRepo.save(profile);

        user = this.userRepo.create({
          email,
          profile,
          role: UserRole.USER,
        });

        await this.userRepo.save(user);
      }

      const jwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
      const accessToken = this.jwtService.sign(jwtPayload);

      const selectedFund = user.funds?.find((f) => f.is_selected) ?? null;

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
            fund: selectedFund,
            hasCategories: user.categories?.length > 0,
            role: user.role,
          },
        },
      });
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Đăng nhập Google thất bại');
    }
  }
}
