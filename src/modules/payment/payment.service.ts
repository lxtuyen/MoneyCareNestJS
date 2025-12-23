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

  async getMonthlyRevenueByIndex(): Promise<
    ApiResponse<{ month: number; total: number }[]>
  > {
    const year = new Date().getFullYear();

    const rows = await this.repo
      .createQueryBuilder('p')
      .select([
        'EXTRACT(MONTH FROM p.createdAt) - 1 AS month',
        'SUM(p.amount) AS total',
      ])
      .where('p.status = :status', { status: 'SUCCEEDED' })
      .andWhere('EXTRACT(YEAR FROM p.createdAt) = :year', { year })
      .groupBy('month')
      .orderBy('month', 'ASC')
      .getRawMany<{ month: number; total: string | null }>();

    const result: { month: number; total: number }[] = Array.from(
      { length: 12 },
      (_, i) => ({ month: i, total: 0 }),
    );

    for (const row of rows) {
      result[row.month].total = Number(row.total ?? 0);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }
}
