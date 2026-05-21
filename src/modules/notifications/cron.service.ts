import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './entities/notification.entity';

@Injectable()
export class CronService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 20 * * *')
  async handleDailyReminderCron() {
    const users = await this.userRepo.find();

    if (users.length === 0) {
      return;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    for (const user of users) {
      const transactionCount = await this.transactionRepo.count({
        where: {
          user: { id: user.id },
          transaction_date: Between(startOfDay, endOfDay),
        },
      });

      if (transactionCount === 0) {
        await this.notificationsService.sendPushNotification(
          user,
          '⏳ Đừng quên nhập chi tiêu',
          'Bạn chưa ghi chép khoản chi tiêu nào hôm nay. Hãy dành 1 phút cập nhật nhé!',
          undefined,
          NotificationType.REMINDER,
        );
      }
    }
  }
}
