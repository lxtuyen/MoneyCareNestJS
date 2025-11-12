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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
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

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng Ký Tài Khoản Thành Công',
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user)
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch)
      throw new UnauthorizedException('Email hoặc mật khẩu không hợp lệ');

    return this.generateToken(user);
  }

  public generateToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
      statusCode: HttpStatus.OK,
      message: 'Đăng nhập thành công',
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        profile: user.profile,
        role: user.role,
      },
    };
  }
}
