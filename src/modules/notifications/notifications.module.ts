import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { DeviceToken } from './entities/device-token.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { CronService } from './cron.service';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, DeviceToken, User, Transaction])],
  controllers: [NotificationsController],
  providers: [NotificationsService, CronService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
