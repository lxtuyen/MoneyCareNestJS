import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ok } from 'src/common/utils/response.util';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import {
  Subscription,
  SubscriptionStatus,
} from 'src/modules/payments/entities/subscription.entity';
import { Payment, PaymentStatus } from 'src/modules/payments/entities/payment.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(SpendingPlan)
    private readonly spendingPlanRepo: Repository<SpendingPlan>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
  ) {}

  async completeInitialFinancialSetup(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const shouldRunInitialFinancialSetup =
      await this.shouldRunInitialFinancialSetup(userId);

    return ok({
      id: user.id,
      shouldRunInitialFinancialSetup,
    });
  }

  private async shouldRunInitialFinancialSetup(userId: number) {
    const planCount = await this.spendingPlanRepo.count({
      where: { user: { id: userId } },
    });

    return planCount === 0;
  }

  // ─── ADMIN METHODS ───────────────────────────────────────────

  async findAllForAdmin(page: number, limit: number, search?: string) {
    const where = search ? { email: ILike(`%${search}%`) } : {};

    const [users, total] = await this.userRepo.findAndCount({
      where,
      relations: ['profile'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Lấy subscription active cho mỗi user
    const userIds = users.map((u) => u.id);
    const activeSubscriptions = userIds.length
      ? await this.subscriptionRepo
          .createQueryBuilder('sub')
          .where('sub.userId IN (:...userIds)', { userIds })
          .andWhere('sub.status IN (:...statuses)', {
            statuses: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE],
          })
          .getMany()
      : [];

    const premiumMap = new Map(activeSubscriptions.map((s) => [s.userId, s]));

    const data = users.map((user) => {
      const sub = premiumMap.get(user.id);
      return {
        id: user.id,
        email: user.email,
        name: user.profile?.first_name
          ? `${user.profile.first_name} ${user.profile.last_name || ''}`.trim()
          : null,
        role: user.role,
        createdAt: user.createdAt,
        isPremium: !!sub,
        premiumStatus: sub?.status || null,
      };
    });

    return ok({
      users: data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  }

  async getAdminStats() {
    const totalUsers = await this.userRepo.count();

    // Users mới hôm nay
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newUsersToday = await this.userRepo
      .createQueryBuilder('user')
      .where('user.createdAt >= :today', { today })
      .getCount();

    // Tổng Premium active
    const totalPremium = await this.subscriptionRepo.count({
      where: [
        { status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.GRACE },
      ],
    });

    // Tổng doanh thu (payments thành công)
    const revenueResult = await this.paymentRepo
      .createQueryBuilder('payment')
      .select('COALESCE(SUM(payment.amount), 0)', 'total')
      .where('payment.status = :status', { status: PaymentStatus.SUCCESS })
      .getRawOne();

    const totalRevenue = Number(revenueResult?.total || 0);

    return ok({
      totalUsers,
      newUsersToday,
      totalPremium,
      totalRevenue,
    });
  }

  async getAdminChartData() {
    // ─── 1. User growth theo tháng (6 tháng gần nhất) ────────────
    const userGrowth = await this.userRepo
      .createQueryBuilder('user')
      .select("TO_CHAR(user.createdAt, 'YYYY-MM')", 'month')
      .addSelect('COUNT(*)', 'count')
      .where("user.createdAt >= NOW() - INTERVAL '6 months'")
      .groupBy("TO_CHAR(user.createdAt, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    // ─── 2. Doanh thu theo tháng (6 tháng gần nhất) ──────────────
    const revenueByMonth = await this.paymentRepo
      .createQueryBuilder('payment')
      .select("TO_CHAR(payment.paidAt, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(payment.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('payment.status = :status', { status: PaymentStatus.SUCCESS })
      .andWhere("payment.paidAt >= NOW() - INTERVAL '6 months'")
      .andWhere('payment.paidAt IS NOT NULL')
      .groupBy("TO_CHAR(payment.paidAt, 'YYYY-MM')")
      .orderBy('month', 'ASC')
      .getRawMany();

    // ─── 3. Tỉ lệ Premium vs Free ───────────────────────────────
    const totalUsers = await this.userRepo.count();
    const premiumCount = await this.subscriptionRepo.count({
      where: [
        { status: SubscriptionStatus.ACTIVE },
        { status: SubscriptionStatus.GRACE },
      ],
    });
    const freeCount = totalUsers - premiumCount;

    // ─── 4. Payment status breakdown ─────────────────────────────
    const paymentStatuses = await this.paymentRepo
      .createQueryBuilder('payment')
      .select('payment.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('payment.status')
      .getRawMany();

    return ok({
      userGrowth: userGrowth.map((r) => ({
        month: r.month,
        count: Number(r.count),
      })),
      revenueByMonth: revenueByMonth.map((r) => ({
        month: r.month,
        total: Number(r.total),
        count: Number(r.count),
      })),
      premiumVsFree: [
        { name: 'Premium', value: premiumCount },
        { name: 'Free', value: freeCount },
      ],
      paymentStatuses: paymentStatuses.map((r) => ({
        status: r.status,
        count: Number(r.count),
      })),
    });
  }
}
