import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { Repository } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(DeviceToken)
    private readonly deviceTokenRepo: Repository<DeviceToken>,
  ) {}

  onModuleInit() {
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.applicationDefault(),
        });
        this.logger.log('Firebase Admin SDK initialized successfully');
      }
    } catch (error) {
      this.logger.warn('Failed to initialize Firebase Admin SDK. Push notifications will not be sent.', error);
    }
  }

  async saveDeviceToken(user: User, token: string) {
    let deviceToken = await this.deviceTokenRepo.findOne({ where: { token }, relations: ['user'] });
    if (!deviceToken) {
      deviceToken = this.deviceTokenRepo.create({ token, user });
    } else {
      deviceToken.user = user;
    }
    await this.deviceTokenRepo.save(deviceToken);
    return { success: true };
  }

  async removeDeviceToken(token: string) {
    await this.deviceTokenRepo.delete({ token });
    return { success: true };
  }

  async getNotificationsForUser(userId: number) {
    return this.notificationRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(notificationId: number, userId: number) {
    await this.notificationRepo.update({ id: notificationId, user: { id: userId } }, { isRead: true });
    return { success: true };
  }

  async sendPushNotification(user: User, title: string, body: string, data?: any) {
    const notification = this.notificationRepo.create({
      title,
      body,
      type: NotificationType.SYSTEM,
      user,
    });
    await this.notificationRepo.save(notification);

    const tokens = await this.deviceTokenRepo.find({ where: { user: { id: user.id } } });
    if (tokens.length === 0) {
      this.logger.log(`User ${user.id} has no registered device tokens.`);
      return;
    }

    const tokenStrings = tokens.map((t) => t.token);

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: tokenStrings,
        notification: {
          title,
          body,
        },
        data: data,
      });

      this.logger.log(`Successfully sent ${response.successCount} messages; Failed: ${response.failureCount}`);
      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(tokenStrings[idx]);
          }
        });
        if (failedTokens.length > 0) {
          await this.deviceTokenRepo.delete(failedTokens.map((t) => ({ token: t })));
        }
      }
    } catch (error) {
      this.logger.error('Error sending default FCM message:', error);
    }
  }
}
