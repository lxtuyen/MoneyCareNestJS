import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationService: NotificationsService) {}

  @Get('user/:userId')
  getAllByUserID(@Param('userId', ParseIntPipe) userId: number) {
    return this.notificationService.getAllByUserID(userId);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id', ParseIntPipe) id: number) {
    return this.notificationService.markAsRead(id);
  }
}
