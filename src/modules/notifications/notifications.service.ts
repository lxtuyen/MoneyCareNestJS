import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Notification, NotificationType } from './entities/notification.entity';

type NotificationData = Record<string, string>;

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  async getNotificationsForUser(userId: number) {
    return this.notificationRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(notificationId: number, userId: number) {
    await this.notificationRepo.update(
      { id: notificationId, user: { id: userId } },
      { isRead: true },
    );
    return { success: true };
  }

  async sendPushNotification(
    user: User,
    title: string,
    body: string,
    data?: NotificationData,
    type: NotificationType = NotificationType.SYSTEM,
  ) {
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({
        title,
        body,
        type,
        user,
      }),
    );

    return {
      success: true,
      notification,
      pushSkipped: true,
      data,
    };
  }
}
