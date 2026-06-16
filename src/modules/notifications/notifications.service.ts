import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import { User } from 'src/modules/user/entities/user.entity';
import { UserProfile } from 'src/modules/user-profile/entities/user-profile.entity';
import { Notification, NotificationType } from './entities/notification.entity';

type NotificationData = Record<string, string>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
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

  async saveFcmToken(userId: number, token: string): Promise<void> {
    const profile = await this.profileRepo.findOne({
      where: { user: { id: userId } },
    });
    if (profile) {
      profile.fcmToken = token;
      await this.profileRepo.save(profile);
    }
  }

  async sendPushNotification(
    user: User,
    title: string,
    body: string,
    data?: NotificationData,
    type: NotificationType = NotificationType.SYSTEM,
  ) {
    // Always persist in-app notification
    const notification = await this.notificationRepo.save(
      this.notificationRepo.create({ title, body, type, user }),
    );

    // Retrieve FCM token from profile
    const profile = await this.profileRepo.findOne({
      where: { user: { id: user.id } },
    });
    const fcmToken = profile?.fcmToken;

    if (!fcmToken) {
      return { success: true, notification, pushSkipped: true };
    }

    try {
      await admin.messaging().send({
        token: fcmToken,
        notification: { title, body },
        data: data ?? {},
        android: {
          priority: 'high',
          notification: { channelId: 'money_care_channel', sound: 'default' },
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
      });
      return { success: true, notification, pushSkipped: false };
    } catch (err) {
      // Token invalid/expired – clear it to avoid repeated failures
      if (
        err instanceof Error &&
        (err.message.includes('registration-token-not-registered') ||
          err.message.includes('invalid-registration-token'))
      ) {
        await this.profileRepo.update({ id: profile!.id }, { fcmToken: null });
      }
      this.logger.warn(`FCM send failed for user ${user.id}: ${String(err)}`);
      return { success: true, notification, pushSkipped: true };
    }
  }

  /** Send push to multiple users by userId list (for couple alerts). */
  async sendPushToUsers(
    userIds: number[],
    title: string,
    body: string,
    data?: NotificationData,
    type: NotificationType = NotificationType.ALERT,
  ): Promise<void> {
    const profiles = await this.profileRepo
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.user', 'user')
      .where('user.id IN (:...userIds)', { userIds })
      .getMany();

    await Promise.all(
      profiles.map((profile) =>
        this.sendPushNotification(
          profile.user,
          title,
          body,
          data,
          type,
        ),
      ),
    );
  }
}
