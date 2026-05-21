import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FixedExpense } from './entities/fixed-expense.entity';
import {
  SpendingPlanStatus,
  SpendingPlanExpenseFrequency,
} from './interfaces/spending-plan.enums';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/notification.entity';

@Injectable()
export class SpendingPlanCronService {
  private readonly logger = new Logger(SpendingPlanCronService.name);

  constructor(
    @InjectRepository(FixedExpense)
    private readonly fixedExpenseRepo: Repository<FixedExpense>,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async handleFixedExpenseReminders() {
    this.logger.log('Bắt đầu kiểm tra nhắc nhở chi phí cố định đến hạn...');
    const today = new Date();
    const currentDay = today.getDate(); // 1 to 31
    const currentDayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // 1 (Mon) to 7 (Sun)

    // Query for all active, unpaid, reminder-enabled expenses
    const activeExpenses = await this.fixedExpenseRepo.find({
      where: {
        isPaid: false,
        isReminderEnabled: true,
        spendingPlan: {
          status: SpendingPlanStatus.ACTIVE,
        },
      },
      relations: ['user', 'spendingPlan'],
    });

    const dueExpenses = activeExpenses.filter((expense) => {
      if (expense.frequencyType === SpendingPlanExpenseFrequency.DAILY) {
        return true;
      }
      if (expense.frequencyType === SpendingPlanExpenseFrequency.WEEKLY) {
        return expense.dueDay === currentDayOfWeek;
      }
      if (
        expense.frequencyType === SpendingPlanExpenseFrequency.MONTHLY ||
        expense.frequencyType === SpendingPlanExpenseFrequency.ONCE
      ) {
        return expense.dueDay === currentDay;
      }
      return false;
    });

    if (dueExpenses.length === 0) {
      this.logger.log('Không có chi phí cố định nào cần nhắc nhở hôm nay.');
      return;
    }

    this.logger.log(`Tìm thấy ${dueExpenses.length} khoản phí cần nhắc nhở.`);

    for (const expense of dueExpenses) {
      if (expense.user) {
        await this.notificationsService.sendPushNotification(
          expense.user,
          'Đến hạn thanh toán chi phí',
          `Hôm nay là ngày thanh toán khoản "${expense.name}" (${expense.amount.toLocaleString()}đ). Đừng quên cập nhật nhé!`,
          {
            type: 'FIXED_EXPENSE_REMINDER',
            expenseId: expense.id.toString(),
            planId: expense.spendingPlan.id.toString(),
          },
          NotificationType.SYSTEM,
        );
      }
    }

    this.logger.log('Hoàn tất gửi thông báo nhắc nhở chi phí cố định.');
  }
}
