import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { NotificationsService } from './notifications.service';
import { NotificationType } from './entities/notification.entity';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 20 * * *')
  async handleDailyReminderCron() {
    this.logger.log('Running daily reminder cronjob...');

    const usersWithTokens = await this.userRepo
      .createQueryBuilder('user')
      .innerJoin('user.deviceTokens', 'deviceToken')
      .getMany();

    if (usersWithTokens.length === 0) {
      this.logger.log('No users with device tokens. Skip reminder.');
      return;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    let sentCount = 0;

    for (const user of usersWithTokens) {
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
        sentCount++;
      }
    }

    this.logger.log(`Daily reminder push sent to ${sentCount} users.`);
  }
}
