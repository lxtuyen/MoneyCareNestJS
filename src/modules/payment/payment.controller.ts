import { Body, Controller, Post } from '@nestjs/common';
import { PaymentsService } from './payment.service';
import { ConfirmVipDto } from './dto/confirm-vip.dto';

@Controller('vip-payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post('confirm')
  confirm(@Body() dto: ConfirmVipDto) {
    return this.service.confirm(dto);
  }
}
