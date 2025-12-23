import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfirmVipDto } from './dto/confirm-vip.dto';
import { VipPayment } from './entities/payment.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(VipPayment)
    private readonly repo: Repository<VipPayment>,
  ) {}

  async confirm(dto: ConfirmVipDto): Promise<ApiResponse<null>> {
    const row = this.repo.create({
      userId: dto.userId,
      platform: dto.platform,
      amount: dto.amount,
      currency: dto.currency,
      status: 'SUCCEEDED',
    });

    await this.repo.save(row);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Thanh toán thành công!',
    });
  }
}
