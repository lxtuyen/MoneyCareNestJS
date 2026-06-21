import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { AdminGuard } from 'src/common/guards/admin.guard';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('payments')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    return this.paymentsService.findAllPaymentsForAdmin(
      Number(page) || 1,
      Number(limit) || 20,
      status,
    );
  }
}
