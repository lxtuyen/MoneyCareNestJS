import { Body, Controller, Delete, Get, HttpStatus, Logger, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { NotificationsService } from './notifications.service';
import { CreateDeviceTokenDto } from './dto/create-device-token.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { Request } from 'express';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);
 
  constructor(private readonly notificationsService: NotificationsService) {}

  @ApiOperation({ summary: 'Save FCM device token' })
  @Post('users/device-tokens')
  async saveToken(@Req() req: Request, @Body() dto: CreateDeviceTokenDto) {
    const user = req.user as any;
    const result = await this.notificationsService.saveDeviceToken(user, dto.token);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @ApiOperation({ summary: 'Remove FCM device token (logout)' })
  @Delete('users/device-tokens')
  async removeToken(@Req() req: Request, @Body() dto: CreateDeviceTokenDto) {
    const result = await this.notificationsService.removeDeviceToken(dto.token);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }

  @ApiOperation({ summary: 'Get user notifications' })
  @Get('notifications')
  async getNotifications(@Req() req: Request) {
    const user = req.user as any;
    const notifications = await this.notificationsService.getNotificationsForUser(user.id);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: notifications,
    });
  }

  @ApiOperation({ summary: 'Mark a notification as read' })
  @Patch('notifications/:id/read')
  async markAsRead(@Req() req: Request, @Param('id') id: string) {
    const user = req.user as any;
    const result = await this.notificationsService.markAsRead(+id, user.id);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: result,
    });
  }
 
  @ApiOperation({ summary: 'Send a test push notification to self' })
  @Post('notifications/test')
  async testPush(@Req() req: any) {
    const user = req.user;
    if (!user) {
      this.logger.error('No user found in request');
      return new ApiResponse({
        success: false,
        statusCode: HttpStatus.UNAUTHORIZED,
        message: 'User not found in request',
      });
    }
    this.logger.log(`Test push requested for user ${user.id}`);
    const result = await this.notificationsService.sendTestNotification(user);
    return new ApiResponse({
      success: result.success,
      statusCode: result.success ? HttpStatus.OK : HttpStatus.INTERNAL_SERVER_ERROR,
      data: result,
    });
  }
}
