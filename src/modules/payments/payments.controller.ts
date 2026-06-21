import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /** Tạo liên kết thanh toán PayOS để mua Premium */
  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  async subscribe(@Body() dto: SubscribeDto, @Request() req) {
    return this.paymentsService.subscribe(req.user.id, dto);
  }

  /** Kích hoạt free trial 7 ngày */
  @Post('activate-trial')
  @UseGuards(JwtAuthGuard)
  async activateTrial(@Request() req) {
    return this.paymentsService.activateTrial(req.user.id);
  }

  /** PayOS webhook callback — public, không auth */
  @Post('payos-webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: Record<string, unknown>) {
    return this.paymentsService.handleWebhook(body);
  }

  /** Kiểm tra trạng thái Premium của user hiện tại */
  @Get('subscription-status')
  @UseGuards(JwtAuthGuard)
  async getSubscriptionStatus(@Request() req) {
    return this.paymentsService.getSubscriptionStatus(req.user.id);
  }

  /** Lịch sử thanh toán */
  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getPaymentHistory(@Request() req) {
    return this.paymentsService.getPaymentHistory(req.user.id);
  }

  /** Chủ động xác minh thanh toán từ PayOS API */
  @Get('verify/:orderCode')
  @UseGuards(JwtAuthGuard)
  async verifyPayment(
    @Param('orderCode', ParseIntPipe) orderCode: number,
    @Request() req,
  ) {
    return this.paymentsService.verifyPayment(req.user.id, orderCode);
  }
}
