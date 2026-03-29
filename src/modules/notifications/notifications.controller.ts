import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { CreateDeviceTokenDto } from './dto/create-device-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Save FCM device token' })
  @Post('users/device-tokens')
  async saveToken(@Req() req: Request, @Body() dto: CreateDeviceTokenDto) {
    const user = req.user as any;
    return this.notificationsService.saveDeviceToken(user, dto.token);
  }

  @ApiOperation({ summary: 'Remove FCM device token (logout)' })
  @Delete('users/device-tokens')
  async removeToken(@Req() req: Request, @Body() dto: CreateDeviceTokenDto) {
    return this.notificationsService.removeDeviceToken(dto.token);
  }

  @ApiOperation({ summary: 'Get user notifications' })
  @Get('notifications')
  async getNotifications(@Req() req: Request) {
    const user = req.user as any;
    return this.notificationsService.getNotificationsForUser(user.id);
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch('notifications/:id/read')
  async markAsRead(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    return this.notificationsService.markAsRead(+id, user.id);
  }
}
