import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfirmVipDto } from './dto/confirm-vip.dto';
import { VipPayment } from './entities/payment.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(VipPayment)
    private readonly repo: Repository<VipPayment>,
  ) {}

  async confirm(dto: ConfirmVipDto) {
    const row = this.repo.create({
      userId: dto.userId,
      platform: dto.platform,
      amount: dto.amount,
      currency: dto.currency,
      status: 'SUCCEEDED',
      paymentData: dto.paymentData ?? null,
    });

    await this.repo.save(row);

    return {
      success: true,
      PaymentId: row.id,
    };
  }
}
