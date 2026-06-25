import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';
import { HabitCommitmentsService } from './habit-commitments.service';
import { CreateHabitCommitmentDto } from './dto/create-habit-commitment.dto';

@Controller('habit-commitments')
@UseGuards(JwtAuthGuard)
export class HabitCommitmentsController {
  constructor(private readonly service: HabitCommitmentsService) {}

  @Post()
  async create(
    @User('sub') userId: number,
    @Body() dto: CreateHabitCommitmentDto,
  ) {
    const commitment = await this.service.create(userId, dto);
    return ok(commitment, 'Đã tạo cam kết giảm thói quen');
  }

  @Get()
  async findByMonth(
    @User('sub') userId: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    const commitments = await this.service.findByMonth(userId, month, year);
    return ok(commitments);
  }

  @Get('progress')
  async getProgressByMonth(
    @User('sub') userId: number,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    const progress = await this.service.getProgressByMonth(
      userId,
      month,
      year,
    );
    return ok(
      progress.map((p) => ({
        id: p.commitment.id,
        habitName: p.commitment.habitName,
        subcategoryName: p.commitment.subcategoryName,
        committedCount: p.commitment.committedCount,
        potentialSavings: Number(p.commitment.potentialSavings) || 0,
        avgPerTransaction: Number(p.commitment.avgPerTransaction) || 0,
        projectedCount: p.commitment.projectedCount || 0,
        currentCount: p.currentCount,
        remaining: p.remaining,
        isExceeded: p.isExceeded,
        goalId: p.commitment.goalId,
        goalName: p.commitment.goal?.name ?? null,
      })),
    );
  }

  @Get(':id/progress')
  async getProgress(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const p = await this.service.getProgress(userId, id);
    return ok({
      id: p.commitment.id,
      habitName: p.commitment.habitName,
      subcategoryName: p.commitment.subcategoryName,
      committedCount: p.commitment.committedCount,
      potentialSavings: Number(p.commitment.potentialSavings) || 0,
      avgPerTransaction: Number(p.commitment.avgPerTransaction) || 0,
      projectedCount: p.commitment.projectedCount || 0,
      currentCount: p.currentCount,
      remaining: p.remaining,
      isExceeded: p.isExceeded,
    });
  }

  @Patch(':id')
  async update(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body('committedCount', ParseIntPipe) committedCount: number,
  ) {
    const commitment = await this.service.update(userId, id, committedCount);
    return ok(commitment, 'Đã cập nhật cam kết');
  }

  @Delete(':id')
  async remove(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.service.remove(userId, id);
    return ok(null, 'Đã hủy cam kết');
  }
}
