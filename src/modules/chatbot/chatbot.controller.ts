import { Body, Controller, Post, BadRequestException, UseInterceptors, UploadedFile } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatDto } from './dto/chat.dto';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async chat(
    @Body() dto: ChatDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!dto?.message && !file) {
      throw new BadRequestException(
        'Body cần có "message" hoặc một file ảnh đính kèm.',
      );
    }
    if (dto?.userId == null) {
      throw new BadRequestException('userId là bắt buộc.');
    }
    return this.chatbotService.handle(dto.message, dto.userId, file);
  }

  @Post('bulk-save')
  async bulkSave(@Body() body: { userId: number; items: any[] }) {
    if (!body.userId || !body.items || !Array.isArray(body.items)) {
      throw new BadRequestException('userId và danh sách items là bắt buộc.');
    }
    await this.chatbotService.bulkCreateTransactions(body.userId, body.items);
    return { success: true, message: 'Đã lưu tất cả giao dịch thành công.' };
  }
}
