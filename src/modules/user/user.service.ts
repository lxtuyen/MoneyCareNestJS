import { AdminUserStatsDto } from './dto/admin-user-stats.dto';
import { Injectable, NotFoundException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { User } from './entities/user.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserListDto } from './dto/user-list.dto';
import { VipPayment } from '../payment/entities/payment.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(VipPayment)
    private readonly repo: Repository<VipPayment>,
  ) {}

  async getTotalUsers(): Promise<ApiResponse<number>> {
    const total = await this.userRepo.count();

    return new ApiResponse<number>({
      success: true,
      statusCode: HttpStatus.OK,
      data: total,
    });
  }

  async listUsers(): Promise<ApiResponse<UserListDto[]>> {
    const users = await this.userRepo.find({
      select: ['id', 'email', 'role', 'isVip'],
      order: { createdAt: 'DESC' },
    });

    return new ApiResponse<UserListDto[]>({
      success: true,
      statusCode: HttpStatus.OK,
      data: users,
    });
  }

  async getNewUsersThisMonth(): Promise<ApiResponse<number>> {
    const now = new Date();
    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
    );

    const count = await this.userRepo.count({
      where: {
        createdAt: MoreThanOrEqual(startOfMonth),
      },
    });

    return new ApiResponse<number>({
      success: true,
      statusCode: HttpStatus.OK,
      data: count,
    });
  }
  async getMonthlyRevenue(): Promise<number> {
    const now = new Date();

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
    );

    const endOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
    );

    const result = await this.repo
      .createQueryBuilder('p')
      .select('SUM(p.amount)', 'total')
      .where('p.status = :status', { status: 'SUCCEEDED' })
      .andWhere('p.createdAt BETWEEN :start AND :end', {
        start: startOfMonth,
        end: endOfMonth,
      })
      .getRawOne<{ total: string | null }>();

    const total = Number(result?.total ?? 0);

    return Number(total ?? 0);
  }

  async updateUser(
    userId: number,
    dto: UpdateUserDto,
  ): Promise<ApiResponse<UserListDto>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let hasChange = false;

    if (dto.role !== undefined && dto.role !== user.role) {
      user.role = dto.role;
      hasChange = true;
    }

    if (dto.isVip !== undefined && dto.isVip !== user.isVip) {
      user.isVip = dto.isVip;
      hasChange = true;
    }

    if (!hasChange) {
      return new ApiResponse<User>({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'No changes detected',
        data: user,
      });
    }

    const updatedUser = await this.userRepo.save(user);

    return new ApiResponse<User>({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'User updated successfully',
      data: updatedUser,
    });
  }

  async getUserTypePercentage(): Promise<
    ApiResponse<{
      freePercent: number;
      vipPercent: number;
    }>
  > {
    const total = await this.userRepo.count();

    if (total === 0) {
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: {
          freePercent: 0,
          vipPercent: 0,
        },
      });
    }

    const vip = await this.userRepo.count({
      where: { isVip: true },
    });

    const free = total - vip;

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        freePercent: +((free / total) * 100).toFixed(2),
        vipPercent: +((vip / total) * 100).toFixed(2),
      },
    });
  }

  async getAdminUserStats(): Promise<ApiResponse<AdminUserStatsDto>> {
    const [total, newThisMonth, vip, monthlyRevenue] = await Promise.all([
      this.userRepo.count(),
      this.getNewUsersThisMonth().then((r) => r.data ?? 0),
      this.userRepo.count({ where: { isVip: true } }),
      this.getMonthlyRevenue(),
    ]);

    const free = total - vip;

    const stats: AdminUserStatsDto = {
      totalUsers: total,
      newUsersThisMonth: newThisMonth,
      freePercent: total ? +((free / total) * 100).toFixed(2) : 0,
      vipPercent: total ? +((vip / total) * 100).toFixed(2) : 0,
      monthlyRevenue: monthlyRevenue,
    };

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: stats,
    });
  }
}
