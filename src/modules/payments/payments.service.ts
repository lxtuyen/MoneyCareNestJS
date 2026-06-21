import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PayOS } = require('@payos/node');

import {
  Subscription,
  SubscriptionStatus,
} from './entities/subscription.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { SubscribeDto } from './dto/subscribe.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

/** Giá Premium cố định (VND) */
const PREMIUM_PRICE = 49999;
/** Thời hạn gói (ngày) */
const PREMIUM_DURATION_DAYS = 30;
/** Thời hạn trial (ngày) */
const TRIAL_DURATION_DAYS = 7;
/** Grace period sau khi hết hạn (ngày) */
const GRACE_PERIOD_DAYS = 3;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly payos: InstanceType<typeof PayOS>;

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const clientId = this.configService.get<string>('PAYOS_CLIENT_ID', '');
    const apiKey = this.configService.get<string>('PAYOS_API_KEY', '');
    const checksumKey = this.configService.get<string>(
      'PAYOS_CHECKSUM_KEY',
      '',
    );

    if (!clientId || !apiKey || !checksumKey) {
      this.logger.warn(
        'PayOS credentials not fully configured. Payment features will not work.',
      );
    }

    this.payos = new PayOS(clientId, apiKey, checksumKey);
  }

  // ─── SUBSCRIBE (tạo payment link) ────────────────────────────

  async subscribe(
    userId: number,
    dto: SubscribeDto,
  ): Promise<ApiResponse<{ checkoutUrl: string; subscriptionId: number }>> {
    // Kiểm tra đang có subscription active/grace
    const existing = await this.subscriptionRepo.findOne({
      where: [
        { userId, status: SubscriptionStatus.ACTIVE },
        { userId, status: SubscriptionStatus.GRACE },
      ],
    });
    if (existing) {
      throw new ConflictException('Bạn đang có gói Premium còn hiệu lực.');
    }

    // ─── Check pending: trả lại link cũ thay vì tạo mới ────────
    const pendingSub = await this.subscriptionRepo.findOne({
      where: { userId, status: SubscriptionStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    if (pendingSub) {
      const pendingPayment = await this.paymentRepo.findOne({
        where: {
          subscriptionId: pendingSub.id,
          status: PaymentStatus.PENDING,
        },
      });

      if (pendingPayment?.checkoutUrl) {
        this.logger.log(
          `Returning existing checkout URL for user ${userId}, orderCode: ${pendingPayment.orderCode}`,
        );
        return new ApiResponse({
          success: true,
          statusCode: HttpStatus.OK,
          data: {
            checkoutUrl: pendingPayment.checkoutUrl,
            subscriptionId: pendingSub.id,
          },
          message: 'Bạn đang có giao dịch chờ thanh toán',
        });
      }

      // Pending nhưng không có checkoutUrl → cancel cũ và tạo mới
      pendingSub.status = SubscriptionStatus.EXPIRED;
      await this.subscriptionRepo.save(pendingSub);
      if (pendingPayment) {
        pendingPayment.status = PaymentStatus.CANCELLED;
        await this.paymentRepo.save(pendingPayment);
      }
    }

    // ─── Tạo subscription + payment mới ──────────────────────────
    const subscription = this.subscriptionRepo.create({
      userId,
      plan: 'premium_monthly',
      amount: PREMIUM_PRICE,
      status: SubscriptionStatus.PENDING,
      isTrial: false,
    });
    const savedSub = await this.subscriptionRepo.save(subscription);

    // Tạo orderCode unique cho PayOS (timestamp + random)
    const orderCode = Number(
      `${Date.now()}${Math.floor(Math.random() * 1000)}`
        .slice(0, 13),
    );

    // Gọi PayOS tạo payment link
    const returnUrl =
      dto.returnUrl ||
      this.configService.get<string>(
        'PAYOS_RETURN_URL',
        'http://localhost:3000/payments/payos-return',
      );
    const cancelUrl =
      dto.cancelUrl ||
      this.configService.get<string>(
        'PAYOS_CANCEL_URL',
        'http://localhost:3000/payments/payos-cancel',
      );

    const paymentLink = await this.payos.paymentRequests.create({
      orderCode,
      amount: PREMIUM_PRICE,
      description: 'MNCARE Premium',
      returnUrl,
      cancelUrl,
    });

    // Tạo payment record (lưu cả checkoutUrl để reuse)
    const payment = this.paymentRepo.create({
      orderCode,
      userId,
      subscriptionId: savedSub.id,
      amount: PREMIUM_PRICE,
      status: PaymentStatus.PENDING,
      provider: 'payos',
      checkoutUrl: paymentLink.checkoutUrl,
    });
    await this.paymentRepo.save(payment);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: {
        checkoutUrl: paymentLink.checkoutUrl,
        subscriptionId: savedSub.id,
      },
      message: 'Tạo liên kết thanh toán thành công',
    });
  }

  // ─── ACTIVATE TRIAL ──────────────────────────────────────────

  async activateTrial(
    userId: number,
  ): Promise<ApiResponse<{ subscriptionId: number; expiresAt: Date }>> {
    // Kiểm tra đã từng trial chưa
    const hadTrial = await this.subscriptionRepo.findOne({
      where: { userId, isTrial: true },
    });
    if (hadTrial) {
      throw new ConflictException(
        'Bạn đã sử dụng bản dùng thử. Vui lòng mua gói Premium.',
      );
    }

    // Kiểm tra đang active
    const existing = await this.subscriptionRepo.findOne({
      where: [
        { userId, status: SubscriptionStatus.ACTIVE },
        { userId, status: SubscriptionStatus.GRACE },
      ],
    });
    if (existing) {
      throw new ConflictException('Bạn đang có gói Premium còn hiệu lực.');
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS);

    const graceEndDate = new Date(endDate);
    graceEndDate.setDate(graceEndDate.getDate() + GRACE_PERIOD_DAYS);

    const subscription = this.subscriptionRepo.create({
      userId,
      plan: 'premium_monthly',
      amount: 0,
      status: SubscriptionStatus.ACTIVE,
      isTrial: true,
      startDate: now,
      endDate,
      graceEndDate,
    });
    const saved = await this.subscriptionRepo.save(subscription);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: { subscriptionId: saved.id, expiresAt: endDate },
      message: 'Kích hoạt dùng thử 7 ngày thành công!',
    });
  }

  // ─── VERIFY PAYMENT (chủ động check PayOS) ─────────────────────

  async verifyPayment(
    userId: number,
    orderCode: number,
  ): Promise<ApiResponse<{ verified: boolean; status: string }>> {
    // Tìm payment trong DB
    const payment = await this.paymentRepo.findOne({
      where: { orderCode },
    });

    if (!payment) {
      throw new HttpException('Không tìm thấy giao dịch', HttpStatus.NOT_FOUND);
    }

    // Đã xử lý rồi thì trả luôn
    if (payment.status === PaymentStatus.SUCCESS) {
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: { verified: true, status: 'success' },
        message: 'Thanh toán đã được xác nhận trước đó',
      });
    }

    try {
      // Gọi PayOS API để check trạng thái thực tế
      const payosData = await this.payos.paymentRequests.get(orderCode);

      if (payosData && payosData.status === 'PAID') {
        // Thanh toán thành công → activate
        await this.dataSource.transaction(async (manager) => {
          payment.status = PaymentStatus.SUCCESS;
          payment.paidAt = new Date();
          payment.webhookData = payosData as any;
          await manager.save(Payment, payment);

          const subscription = await manager.findOne(Subscription, {
            where: { id: payment.subscriptionId },
          });

          if (subscription) {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setDate(endDate.getDate() + PREMIUM_DURATION_DAYS);

            const graceEndDate = new Date(endDate);
            graceEndDate.setDate(graceEndDate.getDate() + GRACE_PERIOD_DAYS);

            subscription.status = SubscriptionStatus.ACTIVE;
            subscription.startDate = now;
            subscription.endDate = endDate;
            subscription.graceEndDate = graceEndDate;
            await manager.save(Subscription, subscription);
          }
        });

        this.logger.log(`Payment ${orderCode} verified via API → activated`);

        return new ApiResponse({
          success: true,
          statusCode: HttpStatus.OK,
          data: { verified: true, status: 'success' },
          message: 'Thanh toán thành công! Premium đã được kích hoạt.',
        });
      }

      // Chưa thanh toán hoặc thất bại
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: { verified: false, status: payosData?.status || 'unknown' },
        message: 'Giao dịch chưa hoàn tất',
      });
    } catch (error) {
      this.logger.error(`Error verifying payment ${orderCode}:`, error);
      return new ApiResponse({
        success: false,
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        data: { verified: false, status: 'error' },
        message: 'Không thể xác minh trạng thái thanh toán',
      });
    }
  }

  // ─── PAYOS WEBHOOK ───────────────────────────────────────────

  async handleWebhook(
    body: Record<string, unknown>,
  ): Promise<{ success: boolean }> {
    try {
      // Verify webhook data từ PayOS
      const webhookData = this.payos.webhooks.verify(body as any);

      if (!webhookData || !webhookData.orderCode) {
        this.logger.warn('Invalid webhook data received');
        return { success: false };
      }

      const orderCode = Number(webhookData.orderCode);
      const payment = await this.paymentRepo.findOne({ where: { orderCode } });

      if (!payment) {
        this.logger.warn(`Payment not found for orderCode: ${orderCode}`);
        return { success: false };
      }

      // Đã xử lý rồi thì bỏ qua (idempotent)
      if (payment.status === PaymentStatus.SUCCESS) {
        return { success: true };
      }

      const isSuccess = webhookData.code === '00';

      if (isSuccess) {
        await this.dataSource.transaction(async (manager) => {
          // Cập nhật payment
          payment.status = PaymentStatus.SUCCESS;
          payment.providerTransactionId = String(
            webhookData.transactionNumber || '',
          );
          payment.webhookData = body;
          payment.paidAt = new Date();
          await manager.save(Payment, payment);

          // Activate subscription
          const subscription = await manager.findOne(Subscription, {
            where: { id: payment.subscriptionId },
          });

          if (subscription) {
            const now = new Date();
            const endDate = new Date(now);
            endDate.setDate(endDate.getDate() + PREMIUM_DURATION_DAYS);

            const graceEndDate = new Date(endDate);
            graceEndDate.setDate(
              graceEndDate.getDate() + GRACE_PERIOD_DAYS,
            );

            subscription.status = SubscriptionStatus.ACTIVE;
            subscription.startDate = now;
            subscription.endDate = endDate;
            subscription.graceEndDate = graceEndDate;
            await manager.save(Subscription, subscription);
          }
        });

        this.logger.log(
          `Payment ${orderCode} succeeded → subscription activated`,
        );
      } else {
        payment.status = PaymentStatus.FAILED;
        payment.webhookData = body;
        await this.paymentRepo.save(payment);
        this.logger.log(`Payment ${orderCode} failed`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Webhook processing error:', error);
      return { success: false };
    }
  }

  // ─── SUBSCRIPTION STATUS ─────────────────────────────────────

  async getSubscriptionStatus(userId: number): Promise<
    ApiResponse<{
      isPremium: boolean;
      isGracePeriod: boolean;
      isTrial: boolean;
      hasUsedTrial: boolean;
      plan: string | null;
      expiresAt: Date | null;
      graceExpiresAt: Date | null;
      daysRemaining: number;
    }>
  > {
    const now = new Date();

    // Tìm subscription active hoặc grace mới nhất
    const subscription = await this.subscriptionRepo.findOne({
      where: [
        { userId, status: SubscriptionStatus.ACTIVE },
        { userId, status: SubscriptionStatus.GRACE },
      ],
      order: { createdAt: 'DESC' },
    });

    // Check đã dùng trial chưa
    const hasUsedTrial = !!(await this.subscriptionRepo.findOne({
      where: { userId, isTrial: true },
    }));

    if (!subscription) {
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: {
          isPremium: false,
          isGracePeriod: false,
          isTrial: false,
          hasUsedTrial,
          plan: null,
          expiresAt: null,
          graceExpiresAt: null,
          daysRemaining: 0,
        },
      });
    }

    const endDate = subscription.endDate
      ? new Date(subscription.endDate)
      : null;
    const graceEndDate = subscription.graceEndDate
      ? new Date(subscription.graceEndDate)
      : null;

    const isActive =
      subscription.status === SubscriptionStatus.ACTIVE &&
      endDate !== null &&
      now <= endDate;
    const isGracePeriod =
      !isActive &&
      graceEndDate !== null &&
      now <= graceEndDate;

    // Tính số ngày còn lại
    let daysRemaining = 0;
    if (isActive && endDate) {
      daysRemaining = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
    } else if (isGracePeriod && graceEndDate) {
      daysRemaining = Math.ceil(
        (graceEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        isPremium: isActive || isGracePeriod,
        isGracePeriod,
        isTrial: subscription.isTrial,
        hasUsedTrial,
        plan: subscription.plan,
        expiresAt: endDate,
        graceExpiresAt: graceEndDate,
        daysRemaining: Math.max(0, daysRemaining),
      },
    });
  }

  // ─── PAYMENT HISTORY ─────────────────────────────────────────

  async getPaymentHistory(
    userId: number,
  ): Promise<ApiResponse<Payment[]>> {
    const payments = await this.paymentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: payments,
    });
  }

  // ─── CRON: Expire subscriptions ──────────────────────────────

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireSubscriptions(): Promise<void> {
    const now = new Date();

    // Active → Grace (hết endDate)
    const toGrace = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .where('sub.status = :status', { status: SubscriptionStatus.ACTIVE })
      .andWhere('sub.endDate IS NOT NULL')
      .andWhere('sub.endDate < :now', { now })
      .getMany();

    if (toGrace.length > 0) {
      for (const sub of toGrace) {
        sub.status = SubscriptionStatus.GRACE;
      }
      await this.subscriptionRepo.save(toGrace);
      this.logger.log(
        `Moved ${toGrace.length} subscription(s) to GRACE period`,
      );
    }

    // Grace → Expired (hết graceEndDate)
    const toExpire = await this.subscriptionRepo
      .createQueryBuilder('sub')
      .where('sub.status = :status', { status: SubscriptionStatus.GRACE })
      .andWhere('sub.graceEndDate IS NOT NULL')
      .andWhere('sub.graceEndDate < :now', { now })
      .getMany();

    if (toExpire.length > 0) {
      for (const sub of toExpire) {
        sub.status = SubscriptionStatus.EXPIRED;
      }
      await this.subscriptionRepo.save(toExpire);
      this.logger.log(`Expired ${toExpire.length} subscription(s)`);
    }

    // Pending payments quá 24h → Failed
    const staleDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await this.paymentRepo
      .createQueryBuilder()
      .update(Payment)
      .set({ status: PaymentStatus.FAILED })
      .where('status = :status', { status: PaymentStatus.PENDING })
      .andWhere('createdAt < :staleDate', { staleDate })
      .execute();
  }

  // ─── ADMIN: All payments ─────────────────────────────────────

  async findAllPaymentsForAdmin(
    page: number,
    limit: number,
    status?: string,
  ) {
    const qb = this.paymentRepo
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.user', 'user')
      .orderBy('payment.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (status && Object.values(PaymentStatus).includes(status as PaymentStatus)) {
      qb.where('payment.status = :status', { status });
    }

    const [payments, total] = await qb.getManyAndCount();

    const data = payments.map((p) => ({
      id: p.id,
      orderCode: p.orderCode,
      amount: p.amount,
      status: p.status,
      provider: p.provider,
      userEmail: p.user?.email || null,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
    }));

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        payments: data,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
}
