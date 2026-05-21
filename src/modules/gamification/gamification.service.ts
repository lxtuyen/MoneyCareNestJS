import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GamificationEntity } from './entities/gamification.entity';
import { RecordDayDto } from './dto/gamification.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { getTodayStringInTimeZone } from 'src/common/utils/date.util';

@Injectable()
export class GamificationService {
  constructor(
    @InjectRepository(GamificationEntity)
    private readonly gamificationRepo: Repository<GamificationEntity>,
  ) {}

  private async findOrCreate(userId: number): Promise<GamificationEntity> {
    const record = await this.gamificationRepo.findOne({ where: { userId } });
    if (record) return record;

    try {
      const newRecord = this.gamificationRepo.create({
        userId,
        currentStreak: 0,
        lastTransactionDate: null,
        badges: [],
      });
      return await this.gamificationRepo.save(newRecord);
    } catch (error) {
      const dbError = error as { code?: string };
      if (dbError?.code === '23505') {
        return (await this.gamificationRepo.findOne({
          where: { userId },
        })) as GamificationEntity;
      }
      throw error;
    }
  }

  calculateNewStreak(
    currentStreak: number,
    lastTransactionDate: string | null,
    transactionDate: string,
  ): number {
    if (!lastTransactionDate) {
      return 1;
    }

    const last = new Date(lastTransactionDate);
    const current = new Date(transactionDate);

    const diffMs = current.getTime() - last.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return currentStreak;
    } else if (diffDays === 1) {
      return currentStreak + 1;
    } else {
      return 1;
    }
  }

  async findByUser(userId: number): Promise<ApiResponse<GamificationEntity>> {
    const record = await this.findOrCreate(userId);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: record,
    });
  }

  async recordDay(
    userId: number,
    dto: RecordDayDto,
  ): Promise<ApiResponse<GamificationEntity>> {
    const transactionDate = dto.date ?? getTodayStringInTimeZone();
    const record = await this.findOrCreate(userId);

    const newStreak = this.calculateNewStreak(
      record.currentStreak,
      record.lastTransactionDate,
      transactionDate,
    );

    const isNewDay =
      !record.lastTransactionDate ||
      transactionDate > record.lastTransactionDate;

    if (isNewDay) {
      record.currentStreak = newStreak;
      record.lastTransactionDate = transactionDate;

      await this.gamificationRepo.save(record);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: isNewDay
        ? `Streak cập nhật: ${record.currentStreak} ngày`
        : 'Đã ghi nhận hôm nay rồi',
      data: record,
    });
  }
}
