import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { FinanceModeService } from './finance-mode.service';
import { UpdateFinanceModeDto } from './dto/finance-mode.dto';
import { User } from 'src/common/decorators/user.decorator';

@Controller('finance-mode')
@UseGuards(JwtAuthGuard)
export class FinanceModeController {
  constructor(private readonly financeModeService: FinanceModeService) {}

  @Get()
  getMyMode(@User('sub') userId: number) {
    return this.financeModeService.getByUserId(userId);
  }

  @Put()
  updateMyMode(
    @User('sub') userId: number,
    @Body() dto: UpdateFinanceModeDto,
  ) {
    return this.financeModeService.updateByUserId(userId, dto);
  }
}
