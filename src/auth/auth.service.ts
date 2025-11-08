import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { User, UserRole } from 'src/user/entities/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserProfile } from 'src/user-profile/entities/user-profile.entity';
import { randomInt } from 'crypto';
import { OTP } from 'src/otp/entities/otp.entity';
import { MailService } from 'src/mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(OTP)
    private readonly otpRepo: Repository<OTP>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const exist = await this.userRepo.findOne({ where: { email: dto.email } });
    if (exist) throw new ConflictException('Email already exists');

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

    const code = randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const otp = this.otpRepo.create({
      code,
      expires_at: expiresAt,
      user,
    });
    await this.otpRepo.save(otp);

    await this.mailService.sendOtpEmail(dto.email, code);

    return { message: 'OTP đã được gửi đến email của bạn' };
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

    user.verify_email = true;
    await this.userRepo.save(user);

    await this.otpRepo.remove(otp);

    return this.generateToken(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const isMatch = await bcrypt.compare(dto.password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid email or password');

    return this.generateToken(user);
  }

  private generateToken(user: User) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    return {
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
