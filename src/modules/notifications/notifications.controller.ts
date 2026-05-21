import {
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Get user notifications' })
  @Get('notifications')
  async getNotifications(@CurrentUser('sub') userId: number) {
    const notifications =
      await this.notificationsService.getNotificationsForUser(userId);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: notifications,
    });
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch('notifications/:id/read')
  async markAsRead(
    @CurrentUser('sub') userId: number,
    @Param('id') id: string,
  ) {
    const result = await this.notificationsService.markAsRead(+id, userId);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }
}
