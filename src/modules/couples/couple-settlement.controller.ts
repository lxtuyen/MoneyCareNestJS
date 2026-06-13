import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { CoupleSettlementService } from './couple-settlement.service';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@Controller('couples/settlement')
@UseGuards(JwtAuthGuard)
export class CoupleSettlementController {
  constructor(
    private readonly coupleSettlementService: CoupleSettlementService,
  ) {}

  @Get('summary')
  async getSummary(
    @User('sub') userId: number,
    @Query('coupleId', ParseIntPipe) coupleId: number,
  ) {
    return this.coupleSettlementService.getSettlementSummary(coupleId, userId);
  }

  @Post('settle-up')
  async settleUp(
    @User('sub') userId: number,
    @Query('coupleId', ParseIntPipe) coupleId: number,
  ) {
    return this.coupleSettlementService.settleUp(coupleId, userId);
  }

  @Post('settle-up-single')
  async settleUpSingle(
    @User('sub') userId: number,
    @Query('coupleId', ParseIntPipe) coupleId: number,
    @Query('transactionId', ParseIntPipe) transactionId: number,
  ) {
    return this.coupleSettlementService.settleUpSingle(
      coupleId,
      transactionId,
      userId,
    );
  }
}
