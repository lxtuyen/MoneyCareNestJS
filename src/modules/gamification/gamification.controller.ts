import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { GamificationService } from './gamification.service';
import { RecordDayDto } from './dto/gamification.dto';
import { User } from 'src/common/decorators/user.decorator';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  /**
   * GET /gamification
   * Returns the current streak and badge list for the authenticated user.
   * Requirements 8.8, 10.5
   */
  @Get()
  findByUser(@User('sub') userId: number) {
    return this.gamificationService.findByUser(userId);
  }

  /**
   * POST /gamification/record-day
   * Records a transaction day, updates streak, and awards badges idempotently.
   * Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.9
   */
  @Post('record-day')
  recordDay(@User('sub') userId: number, @Body() dto: RecordDayDto) {
    return this.gamificationService.recordDay(userId, dto);
  }
}
