import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { PendingTransactionService } from './pending-transaction.service';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { PendingTransactionDto } from './dto/pending-transaction.dto';

@Controller('pending-transactions')
export class PendingTransactionController {
  constructor(private readonly pendingService: PendingTransactionService) {}

  @Get(':userId')
  async list(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<ApiResponse<PendingTransactionDto[]>> {
    const data = await this.pendingService.listPending(userId);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data,
    });
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.pendingService.confirm(id);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Giao dịch đã được xác nhận',
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<ApiResponse<null>> {
    await this.pendingService.remove(id);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Đã xoá giao dịch',
    });
  }
}
