import { Controller, Get, Post, Patch, Delete, Body, Query, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { PremiumGuard } from 'src/common/guards/premium.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';
import { SpendingInsightsService } from './spending-insights.service';
import { ConfirmRecurringDto, DismissRecurringDto } from './dto/confirm-recurring.dto';

@Controller('spending-insights')
@UseGuards(JwtAuthGuard, PremiumGuard)
export class SpendingInsightsController {
  constructor(
    private readonly spendingInsightsService: SpendingInsightsService,
  ) {}

  @Get('recurring')
  async getRecurringTransactions(
    @User('sub') userId: number,
    @Query('months') months?: string,
    @Query('minConfidence') minConfidence?: string,
    @Query('forceRefresh') forceRefresh?: string,
  ) {
    const result =
      await this.spendingInsightsService.getRecurringTransactions(
        userId,
        months ? Number(months) : 6,
        minConfidence ? Number(minConfidence) : 0.5,
        forceRefresh === 'true',
      );

    return ok(
      result,
      `Phát hiện ${result.recurringItems.length} khoản chi lặp lại`,
    );
  }

  @Get('recurring/confirmed')
  async getConfirmedRecurring(@User('sub') userId: number) {
    const items =
      await this.spendingInsightsService.getConfirmedRecurring(userId);

    return ok(
      { items, totalMonthly: items.reduce((s, i) => s + Number(i.monthlyEstimate), 0) },
      `${items.length} khoản đã xác nhận`,
    );
  }

  @Post('recurring/confirm')
  async confirmRecurring(
    @User('sub') userId: number,
    @Body() dto: ConfirmRecurringDto,
  ) {
    const result =
      await this.spendingInsightsService.confirmRecurring(userId, dto);

    return ok(result, 'Đã xác nhận khoản chi cố định');
  }

  @Post('recurring/dismiss')
  async dismissRecurring(
    @User('sub') userId: number,
    @Body() dto: DismissRecurringDto,
  ) {
    await this.spendingInsightsService.dismissRecurring(userId, dto);

    return ok(null, 'Đã bỏ qua khoản chi');
  }

  @Patch('recurring/confirmed/:id')
  async updateConfirmedRecurring(
    @User('sub') userId: number,
    @Param('id') id: string,
    @Body() body: { averageAmount?: number; expectedDay?: number; monthlyEstimate?: number },
  ) {
    const result = await this.spendingInsightsService.updateConfirmedRecurring(
      userId,
      Number(id),
      body,
    );
    return ok(result, 'Đã cập nhật khoản chi cố định');
  }

  @Delete('recurring/confirmed/:id')
  async deleteConfirmedRecurring(
    @User('sub') userId: number,
    @Param('id') id: string,
  ) {
    await this.spendingInsightsService.deleteConfirmedRecurring(
      userId,
      Number(id),
    );
    return ok(null, 'Đã xóa khoản chi cố định');
  }
}
