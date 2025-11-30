import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationRepo: Repository<Notification>,
  ) {}

  async getAllByUserID(userId: number): Promise<Notification[]> {
    const notifications = await this.notificationRepo.find({
      where: { user: { id: userId } },
      relations: ['transaction'],
      order: { created_at: 'DESC' },
    });

    return notifications || [];
  }

  async markAsRead(notificationId: number) {
    const notification = await this.notificationRepo.findOne({
      where: { id: notificationId },
    });

    if (!notification) throw new NotFoundException('Notification not found');

    notification.is_read = true;
    return this.notificationRepo.save(notification);
  }
}
