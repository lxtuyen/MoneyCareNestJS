import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { MailService } from '../mailer/mail.service';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { User } from '../user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  generateCsv,
  generateMailTemplate,
  generatePdf,
} from '../../common/utils/transactions-export.utils';

import { SavingGoalsService } from '../saving-goals/saving-goals.service';
import { getVietnamNow, VIETNAM_TIME_ZONE } from 'src/common/utils/date.util';
import { Buffer } from 'buffer';

@Injectable()
export class TransactionExportService {

  constructor(
    private readonly transactionService: TransactionService,
    private readonly mailService: MailService,
    private readonly savingGoalsService: SavingGoalsService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) { }

  async exportAndSendEmail(
    userId: number,
    filter: TransactionFilterDto,
    format: 'pdf' | 'csv',
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });
    if (!user) throw new NotFoundException('User not found');

    const transactionsResponse = await this.transactionService.findAllByFilter({
      ...filter,
      userId,
      limit: undefined,
    });

    if (!transactionsResponse.data) {
      throw new InternalServerErrorException('Không thể lấy dữ liệu giao dịch');
    }

    const { income, expense } = transactionsResponse.data;
    const allTransactions = [...income, ...expense].sort(
      (a, b) =>
        new Date(b.transaction_date).getTime() -
        new Date(a.transaction_date).getTime(),
    );

    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    try {
      if (format === 'csv') {
        buffer = await generateCsv(allTransactions);
        filename = `report_${new Date().getTime()}.csv`;
        contentType = 'text/csv';
      } else {
        const goalsResponse =
          await this.savingGoalsService.findAllByUser(userId);
        const activeGoals = goalsResponse.data || [];

        buffer = await generatePdf(
          allTransactions,
          user,
          activeGoals,
          filter.startDate,
          filter.endDate,
        );
        filename = `report_${new Date().getTime()}.pdf`;
        contentType = 'application/pdf';
      }
    } catch (error) {
      this.logger.error(
        `Failed to generate ${format} report: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        `Lỗi khi tạo file báo cáo: ${error.message}`,
      );
    }

    const userName = user.profile?.first_name
      ? `${user.profile.first_name}${user.profile.last_name ? ' ' + user.profile.last_name : ''}`
      : 'bạn';

    const now = getVietnamNow();
    const subject = `Báo cáo tài chính MoneyCare - ${now.toLocaleDateString('vi-VN', { timeZone: VIETNAM_TIME_ZONE })}`;
    const html = generateMailTemplate(
      userName,
      allTransactions.length,
      format,
      filter.startDate,
      filter.endDate,
    );

    try {
      await this.mailService.sendEmailWithAttachment(
        user.email,
        subject,
        html,
        [
          {
            filename,
            content: buffer,
            contentType,
          },
        ],
      );
    } catch (error) {
      throw error;
    }

    return { success: true, message: 'Báo cáo đã được gửi đến email của bạn' };
  }
}
