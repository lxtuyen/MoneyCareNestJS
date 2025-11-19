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
import { User, UserRole } from 'src/user/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserProfile } from 'src/user-profile/entities/user-profile.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
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
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch)
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');

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
          profile: user.profile,
          savingFund: selectedFund || null,
          role: user.role,
        },
      },
    });
  }
}
