import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import {
  Subscription,
  SubscriptionStatus,
} from 'src/modules/payments/entities/subscription.entity';

/**
 * Guard kiểm tra user có Premium subscription (active hoặc grace).
 * Phải dùng sau JwtAuthGuard: @UseGuards(JwtAuthGuard, PremiumGuard)
 */
@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user?.sub) {
      throw new ForbiddenException(
        'Không xác định được người dùng.',
      );
    }

    const subscription = await this.subscriptionRepo.findOne({
      where: [
        { userId: user.sub, status: SubscriptionStatus.ACTIVE },
        { userId: user.sub, status: SubscriptionStatus.GRACE },
      ],
    });

    if (!subscription) {
      throw new ForbiddenException(
        'Tính năng dành cho gói Premium. Vui lòng nâng cấp để sử dụng.',
      );
    }

    return true;
  }
}
