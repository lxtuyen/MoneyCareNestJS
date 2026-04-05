import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceModeEntity, FinanceModeEnum } from './entities/finance-mode.entity';
import { UpdateFinanceModeDto } from './dto/finance-mode.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class FinanceModeService {
  constructor(
    @InjectRepository(FinanceModeEntity)
    private readonly financeModeRepo: Repository<FinanceModeEntity>,
  ) {}

  async getByUserId(userId: number): Promise<ApiResponse<FinanceModeEntity>> {
    let record = await this.financeModeRepo.findOne({ where: { userId } });

    if (!record) {
      record = this.financeModeRepo.create({
        userId,
        mode: FinanceModeEnum.NORMAL,
        suggestionCooldownUntil: null,
      });
      record = await this.financeModeRepo.save(record);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: record,
    });
  }

  async updateByUserId(
    userId: number,
    dto: UpdateFinanceModeDto,
  ): Promise<ApiResponse<FinanceModeEntity>> {
    let record = await this.financeModeRepo.findOne({ where: { userId } });

    if (!record) {
      record = this.financeModeRepo.create({ userId });
    }

    record.mode = dto.mode;

    if (dto.suggestionCooldownUntil !== undefined) {
      record.suggestionCooldownUntil = dto.suggestionCooldownUntil
        ? new Date(dto.suggestionCooldownUntil)
        : null;
    }

    const saved = await this.financeModeRepo.save(record);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật chế độ tài chính thành công',
      data: saved,
    });
  }
}
