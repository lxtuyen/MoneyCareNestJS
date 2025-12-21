import { Controller, Post, Body } from '@nestjs/common';
import { EmailTransferService } from './email-transfer.service';
import { DetectTransferDto } from './dto/detect-transfer.dto';
import { User } from '../user/entities/user.entity';

@Controller('email-transfer')
export class EmailTransferController {
  constructor(private readonly emailTransferService: EmailTransferService) {}

  /**
   * Endpoint test parse email
   */
  @Post('detect')
  detect(@Body() dto: DetectTransferDto) {
    // giả lập user
    const mockUser = { id: 1 } as User;
    return this.emailTransferService.detectTransfer(mockUser, dto);
  }
}
