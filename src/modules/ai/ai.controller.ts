import {
  BadRequestException,
  Body,
  Controller,
  Post,
} from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() dto: ChatDto) {
    if (!dto?.message) {
      throw new BadRequestException('Body cần có "message".');
    }
    if (dto?.userId == null) {
      throw new BadRequestException('userId là bắt buộc.');
    }
    return this.aiService.handle(dto.message, dto.userId);
  }
}
