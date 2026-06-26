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
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import { Subscription } from 'src/modules/payments/entities/subscription.entity';

@Injectable()
export class AuthService {
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(SpendingPlan)
    private readonly spendingPlanRepo: Repository<SpendingPlan>,
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
      avatar:
        'https://i.pinimg.com/736x/0d/64/98/0d64989794b1a4c9d89bff571d3d5842.jpg',
    });
    await this.profileRepo.save(profile);

    const user = this.userRepo.create({
      email: dto.email,
      password: hash,
      profile: profile,
      role: dto.role || UserRole.USER,
    });
    await this.userRepo.save(user);

    const wallet = this.walletRepo.create({
      name: 'Ví 1',
      balance: 0,
      user: user,
      is_active: true,
    });
    await this.walletRepo.save(wallet);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đăng Ký Tài Khoản Thành Công',
    });
  }

  async login(
    dto: LoginDto,
  ): Promise<ApiResponse<{ accessToken: string; user: any; subscription?: any }>> {
    const user = await this.userRepo
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.savingGoals', 'savingGoals')
      .leftJoinAndSelect('user.profile', 'profile')
      .leftJoinAndSelect('user.subscriptions', 'subscriptions')
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

    const selectedGoal = user.savingGoals.find((goal) => goal.is_selected);
    const subscriptionStatus = this.getPremiumStatus(user.subscriptions || []);

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
          savingGoal: selectedGoal || null,
          role: user.role,
          shouldRunInitialFinancialSetup:
            await this.shouldRunInitialFinancialSetup(user.id),
        },
        subscription: subscriptionStatus,
      },
    });
  }

  async googleLogin(
    dto: GoogleLoginDto,
  ): Promise<ApiResponse<{ accessToken: string; user: any; subscription?: any }>> {
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
        relations: ['profile', 'savingGoals', 'subscriptions'],
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

        const wallet = this.walletRepo.create({
          name: 'Ví 1',
          balance: 0,
          user: user,
          is_active: true,
        });
        await this.walletRepo.save(wallet);
      }

      const jwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
      const accessToken = this.jwtService.sign(jwtPayload);

      const selectedGoal = user.savingGoals?.find((f) => f.is_selected) ?? null;
      const subscriptionStatus = this.getPremiumStatus(user.subscriptions || []);

      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Đăng nhập Google thành công',
        data: {
          accessToken,
          user: {
            id: user.id,
            email: user.email,
            profile: user.profile,
            savingGoal: selectedGoal,
            role: user.role,
            shouldRunInitialFinancialSetup:
              await this.shouldRunInitialFinancialSetup(user.id),
          },
          subscription: subscriptionStatus,
        },
      });
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Đăng nhập Google thất bại');
    }
  }

  private async shouldRunInitialFinancialSetup(userId: number) {
    const planCount = await this.spendingPlanRepo.count({
      where: { user: { id: userId } },
    });

    return planCount === 0;
  }

  private getPremiumStatus(subscriptions: Subscription[]): {
    isPremium: boolean;
    isGracePeriod: boolean;
    expiresAt: Date | null;
  } {
    if (!subscriptions || subscriptions.length === 0) {
      return { isPremium: false, isGracePeriod: false, expiresAt: null };
    }

    const now = new Date();

    // Sort subscriptions descending by createdAt to find the latest
    const sorted = [...subscriptions].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    const activeOrGrace = sorted.find(
      (sub) => sub.status === 'active' || sub.status === 'grace',
    );

    if (!activeOrGrace) {
      return { isPremium: false, isGracePeriod: false, expiresAt: null };
    }

    const endDate = activeOrGrace.endDate ? new Date(activeOrGrace.endDate) : null;
    const graceEndDate = activeOrGrace.graceEndDate
      ? new Date(activeOrGrace.graceEndDate)
      : null;

    const isActive =
      activeOrGrace.status === 'active' && endDate !== null && now <= endDate;
    const isGrace = !isActive && graceEndDate !== null && now <= graceEndDate;

    return {
      isPremium: isActive || isGrace,
      isGracePeriod: isGrace,
      expiresAt: endDate,
    };
  }
}
