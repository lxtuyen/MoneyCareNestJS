import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, Not, IsNull } from 'typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { SavingGoalStatus } from './enums/saving-goal-status.enum';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { NotificationType } from 'src/modules/notifications/entities/notification.entity';

@Injectable()
export class GoalsSchedulerService {
  private readonly logger = new Logger(GoalsSchedulerService.name);

  constructor(
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleExpiredGoals() {
    const now = new Date();
    const expiredGoals = await this.goalRepo.find({
      where: {
        status: SavingGoalStatus.ACTIVE,
        end_date: LessThanOrEqual(now),
      },
      relations: ['user', 'wallet'],
    });

    for (const goal of expiredGoals) {
      goal.status = SavingGoalStatus.EXPIRED;
      await this.goalRepo.save(goal);

      // Send push notification when saving goal reaches its end date
      try {
        const goalBalance = goal.wallet?.balance ?? goal.saved_amount;
        const reachedTarget = goal.target != null && goalBalance >= goal.target;
        const title = `📅 Mục tiêu tiết kiệm "${goal.name}" đã đến ngày kết thúc!`;
        const bodyText = reachedTarget
          ? `Chúc mừng bạn! Bạn đã tích lũy thành công ${Math.ceil(goalBalance).toLocaleString('vi-VN')}đ. Hãy tiến hành hoàn thành mục tiêu nhé!`
          : `Mục tiêu "${goal.name}" của bạn đã đến hạn chót nhưng chưa đạt đủ số tiền. Hãy gia hạn hoặc kiểm tra lại nhé!`;

        await this.notificationsService.sendPushNotification(
          goal.user,
          title,
          bodyText,
          { goalId: String(goal.id), type: 'goal_expired' },
          NotificationType.SYSTEM,
        );
      } catch (err) {
        this.logger.warn(
          `Failed to send expiration notification for goal ${goal.id}: ${String(err)}`,
        );
      }
    }

    if (expiredGoals.length > 0) {
      this.logger.log(
        `Marked ${expiredGoals.length} saving goals as EXPIRED.`,
      );
    }
  }
}
