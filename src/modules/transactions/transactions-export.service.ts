import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { TransactionService } from './transactions.service';
import { MailService } from '../mailer/mail.service';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { User } from '../user/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as PDFDocument from 'pdfkit';
import { Parser } from 'json2csv';
import { join } from 'path';

@Injectable()
export class TransactionExportService {
  constructor(
    private readonly transactionService: TransactionService,
    private readonly mailService: MailService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async exportAndSendEmail(userId: number, filter: TransactionFilterDto, format: 'pdf' | 'csv') {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');

    const transactionsResponse = await this.transactionService.findAllByFilter({
      ...filter,
      userId,
      limit: undefined, // Export all for the period
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

    if (format === 'csv') {
      buffer = await this.generateCsv(allTransactions);
      filename = `report_${new Date().getTime()}.csv`;
      contentType = 'text/csv';
    } else {
      buffer = await this.generatePdf(allTransactions, user, filter.startDate, filter.endDate);
      filename = `report_${new Date().getTime()}.pdf`;
      contentType = 'application/pdf';
    }

    const subject = `Báo cáo tài chính MoneyCare - ${new Date().toLocaleDateString('vi-VN')}`;
    const text = `Xin chào ${user.profile?.fullName || 'bạn'},\n\nChúng tôi gửi kèm báo cáo tài chính của bạn trong giai đoạn từ ${filter.startDate || 'đầu'} đến ${filter.endDate || 'nay'}.\n\nTrân trọng,\nMoneyCare Team`;

    await this.mailService.sendEmailWithAttachment(user.email, subject, text, [
      {
        filename,
        content: buffer,
        contentType,
      },
    ]);

    return { success: true, message: 'Report sent to email' };
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

      // Load fonts
      const regularFont = join(__dirname, '..', '..', 'assets', 'fonts', 'BeVietnamPro-Regular.ttf');
      const boldFont = join(__dirname, '..', '..', 'assets', 'fonts', 'BeVietnamPro-Bold.ttf');

      doc.font(boldFont).fontSize(20).text('BÁO CÁO TÀI CHÍNH MONEYCARE', { align: 'center' });
      doc.moveDown();

      doc.font(regularFont).fontSize(12).text(`Người dùng: ${user.profile?.fullName || user.email}`);
      doc.text(`Email: ${user.email}`);
      doc.text(`Thời gian: ${startDate || 'Mọi lúc'} - ${endDate || 'Hiện tại'}`);
      doc.moveDown();

      // Summary
      const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
      
      doc.font(boldFont).text('Tóm tắt:');
      doc.font(regularFont).text(`Tổng thu nhập: ${totalIncome.toLocaleString('vi-VN')} VND`);
      doc.text(`Tổng chi tiêu: ${totalExpense.toLocaleString('vi-VN')} VND`);
      doc.text(`Số dư ròng: ${(totalIncome - totalExpense).toLocaleString('vi-VN')} VND`);
      doc.moveDown();

      // Table Header
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

        const dateStr = new Date(t.transaction_date).toLocaleDateString('vi-VN');
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
}
