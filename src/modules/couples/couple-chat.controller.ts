import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CoupleChatService } from './couple-chat.service';
import { JwtAuthGuard } from 'src/modules/auth/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { ok } from 'src/common/utils/response.util';

@Controller('couples/chat')
@UseGuards(JwtAuthGuard)
export class CoupleChatController {
  constructor(private readonly chatService: CoupleChatService) {}

  @Get('history')
  async getChatHistory(
    @User('sub') userId: number,
    @Query('coupleId') coupleId: number,
  ) {
    const data = await this.chatService.getChatHistory(Number(coupleId), userId);
    return ok(data, 'Lấy lịch sử trò chuyện thành công');
  }
}
