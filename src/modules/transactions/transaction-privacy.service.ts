import { ForbiddenException, Injectable } from '@nestjs/common';
import { CouplesService } from 'src/modules/couples/couples.service';

@Injectable()
export class TransactionPrivacyService {
  constructor(private readonly couplesService: CouplesService) {}

  async ensureCanAccessPersonalTransactions(
    requestUserId: number,
    targetUserId: number,
  ): Promise<void> {
    if (requestUserId === targetUserId) {
      return;
    }

    const hasAccess = await this.couplesService.canAccessPartnerData(
      requestUserId,
      targetUserId,
      'api',
    );

    if (!hasAccess) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập dữ liệu giao dịch cá nhân của đối phương.',
      );
    }
  }

  async ensureCanAccessCouple(
    requestUserId: number,
    coupleId: number,
  ): Promise<void> {
    const activeCouple =
      await this.couplesService.getActiveCoupleForUser(requestUserId);

    if (!activeCouple || activeCouple.id !== coupleId) {
      throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
    }
  }
}
