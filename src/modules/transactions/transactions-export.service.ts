import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { MailService } from '../mailer/mail.service';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { User } from '../user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PDFDocument from 'pdfkit';
import { Parser } from 'json2csv';
import { existsSync } from 'fs';
import { join } from 'path';

@Injectable()
export class TransactionExportService {
  private readonly logger = new Logger(TransactionExportService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly mailService: MailService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async exportAndSendEmail(userId: number, filter: TransactionFilterDto, format: 'pdf' | 'csv') {
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
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );

    let buffer: Buffer;
    let filename: string;
    let contentType: string;

    try {
      if (format === 'csv') {
        this.logger.log(`Generating CSV for user ${userId}`);
        buffer = await this.generateCsv(allTransactions);
        filename = `report_${new Date().getTime()}.csv`;
        contentType = 'text/csv';
      } else {
        this.logger.log(`Generating PDF for user ${userId}`);
        buffer = await this.generatePdf(allTransactions, user, filter.startDate, filter.endDate);
        filename = `report_${new Date().getTime()}.pdf`;
        contentType = 'application/pdf';
      }
    } catch (error) {
      this.logger.error(`Failed to generate ${format} report: ${error.message}`, error.stack);
      throw new InternalServerErrorException(`Lỗi khi tạo file báo cáo: ${error.message}`);
    }

    const userName = user.profile?.first_name 
      ? `${user.profile.first_name}${user.profile.last_name ? ' ' + user.profile.last_name : ''}`
      : 'bạn';

    const subject = `Báo cáo tài chính MoneyCare - ${new Date().toLocaleDateString('vi-VN')}`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #2E7D32; border-bottom: 2px solid #2E7D32; padding-bottom: 10px;">Báo cáo tài chính MoneyCare</h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Chúng tôi gửi kèm báo cáo tài chính của bạn trong giai đoạn từ <strong>${filter.startDate || 'đầu kỳ'}</strong> đến <strong>${filter.endDate || 'hiện tại'}</strong>.</p>
        <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <p style="margin: 0;">Số lượng giao dịch: <strong>${allTransactions.length}</strong></p>
          <p style="margin: 5px 0 0 0;">Định dạng báo cáo: <strong>${format.toUpperCase()}</strong></p>
        </div>
        <p>Vui lòng xem chi tiết trong tệp đính kèm.</p>
        <br/>
        <p style="color: #666; font-size: 12px;">Đây là email tự động, vui lòng không trả lời email này.<br/>MoneyCare Team</p>
      </div>
    `;

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
      this.logger.error(
        `Failed to export transactions for user ${userId} in ${format} format`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    this.logger.log(`Report successfully sent to ${user.email}`);
    return { success: true, message: 'Báo cáo đã được gửi đến email của bạn' };
  }

  private async generateCsv(transactions: any[]): Promise<Buffer> {
    const fields = [
      { label: 'Ngày', value: 'transaction_date' },
      { label: 'Danh mục', value: 'category.name' },
      { label: 'Loại', value: (row: any) => row.type === 'income' ? 'Thu nhập' : 'Chi tiêu' },
      { label: 'Số tiền', value: 'amount' },
      { label: 'Ghi chú', value: 'note' }
    ];

    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(transactions);
    return Buffer.from(csv, 'utf-8');
  }

  private async generatePdf(transactions: any[], user: User, startDate?: string, endDate?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const regularFont = this.resolveFontPath('BeVietnamPro-Regular.ttf');
      const boldFont = this.resolveFontPath('BeVietnamPro-Bold.ttf');

      doc.font(boldFont).fontSize(20).text('BÁO CÁO TÀI CHÍNH MONEYCARE', { align: 'center' });
      doc.moveDown();

      const userName = user.profile?.first_name 
        ? `${user.profile.first_name}${user.profile.last_name ? ' ' + user.profile.last_name : ''}`
        : user.email;

      doc.font(regularFont).fontSize(12).text(`Người dùng: ${userName}`);
      doc.text(`Email: ${user.email}`);
      doc.text(`Thời gian: ${startDate || 'Mọi lúc'} - ${endDate || 'Hiện tại'}`);
      doc.moveDown();

      const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
      
      doc.font(boldFont).text('Tóm tắt:');
      doc.font(regularFont).text(`Tổng thu nhập: ${totalIncome.toLocaleString('vi-VN')} VND`);
      doc.text(`Tổng chi tiêu: ${totalExpense.toLocaleString('vi-VN')} VND`);
      doc.text(`Số dư ròng: ${(totalIncome - totalExpense).toLocaleString('vi-VN')} VND`);
      doc.moveDown();

      const tableTop = doc.y;
      doc.font(boldFont).fontSize(10);
      doc.text('Ngày', 50, tableTop);
      doc.text('Danh mục', 120, tableTop);
      doc.text('Loại', 220, tableTop);
      doc.text('Số tiền', 280, tableTop, { width: 100, align: 'right' });
      doc.text('Ghi chú', 400, tableTop);

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      
      let y = tableTop + 25;
      doc.font(regularFont).fontSize(9);

      for (const t of transactions) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const transDate = t.transaction_date ? new Date(t.transaction_date) : new Date();
        const dateStr = !isNaN(transDate.getTime()) 
          ? transDate.toLocaleDateString('vi-VN') 
          : 'N/A';
          
        doc.text(dateStr, 50, y);
        doc.text(t.category?.name || 'Khác', 120, y);
        doc.text(t.type === 'income' ? 'Thu nhập' : 'Chi tiêu', 220, y);
        doc.text(Number(t.amount).toLocaleString('vi-VN'), 280, y, { width: 100, align: 'right' });
        doc.text(t.note || '', 400, y, { width: 150 });

        y += 20;
      }

      doc.end();
    });
  }

  private resolveFontPath(fileName: string): string {
    const fontCandidates = [
      join(process.cwd(), 'dist', 'assets', 'fonts', fileName),
      join(process.cwd(), 'src', 'assets', 'fonts', fileName),
      join(__dirname, '..', '..', 'assets', 'fonts', fileName),
    ];

    const matchedPath = fontCandidates.find((fontPath) => {
      return existsSync(fontPath);
    });

    if (!matchedPath) {
      this.logger.error(`All font path candidates failed for: ${fileName}`);
      throw new InternalServerErrorException(`Không tìm thấy font hệ thống: ${fileName}`);
    }

    return matchedPath;
  }
}
