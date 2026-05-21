import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { GamificationService } from './gamification.service';
import { RecordDayDto } from './dto/gamification.dto';
import { User } from 'src/common/decorators/user.decorator';

@Controller('gamification')
@UseGuards(JwtAuthGuard)
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  @Get()
  findByUser(@User('sub') userId: number) {
    return this.gamificationService.findByUser(userId);
  }

  @Post('record-day')
  recordDay(@User('sub') userId: number, @Body() dto: RecordDayDto) {
    return this.gamificationService.recordDay(userId, dto);
  }
}
