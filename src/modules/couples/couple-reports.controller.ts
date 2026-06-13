import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { CoupleReportsService } from './couple-reports.service';
import { UpdateCoupleAlertDto } from './dto/couple-report.dto';

@Controller('couples/reports')
@UseGuards(JwtAuthGuard)
export class CoupleReportsController {
  constructor(private readonly reportsService: CoupleReportsService) {}

  @Get('summary')
  getSummary(
    @User('sub') userId: number,
    @Query('coupleId', ParseIntPipe) coupleId: number,
    @Query('month') month: string,
  ) {
    return this.reportsService.getReport(userId, coupleId, month);
  }

  @Patch('alerts/:id/read')
  markAlertRead(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.reportsService.markAlertRead(userId, id);
  }

  @Patch('alerts/:id')
  updateAlert(
    @User('sub') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCoupleAlertDto,
  ) {
    return this.reportsService.updateAlert(userId, id, dto);
  }
}
