import { Body, Controller, Post, BadRequestException } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatDto } from './dto/chat.dto';

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  @Post()
  async chat(@Body() dto: ChatDto) {
    if (!dto?.message || dto?.userId == null) {
      throw new BadRequestException(
        'Body cần có: { "userId": number, "message": string }',
      );
    }
    return this.chatbotService.handle(dto.message, dto.userId);
  }
}
