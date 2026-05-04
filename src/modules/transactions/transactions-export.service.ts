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

import { SavingGoalsService } from '../saving-goals/saving-goals.service';
import { Transaction } from './entities/transaction.entity';

@Injectable()
export class TransactionExportService {
  private readonly logger = new Logger(TransactionExportService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly mailService: MailService,
    private readonly savingGoalsService: SavingGoalsService,
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
        const goalsResponse = await this.savingGoalsService.findAllByUser(userId);
        const activeGoals = goalsResponse.data || [];
        
        buffer = await this.generatePdf(
          allTransactions, 
          user, 
          activeGoals,
          filter.startDate, 
          filter.endDate
        );
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

    const now = new Date();
    const subject = `Báo cáo tài chính MoneyCare - ${now.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
    const formatDate = (dateStr?: string) => {
      if (!dateStr) return null;
      try {
        const d = new Date(dateStr);
        return !isNaN(d.getTime()) ? d.toLocaleDateString('vi-VN') : dateStr;
      } catch {
        return dateStr;
      }
    };

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #333; border-bottom: 2px solid #42A6ED; padding-bottom: 10px;">Báo cáo tài chính <span style="color: #2E7D32;">MoneyCare</span></h2>
        <p>Xin chào <strong>${userName}</strong>,</p>
        <p>Chúng tôi gửi kèm báo cáo tài chính của bạn trong giai đoạn từ <strong>${formatDate(filter.startDate) || 'đầu kỳ'}</strong> đến <strong>${formatDate(filter.endDate) || 'hiện tại'}</strong>.</p>
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

    return { success: true, message: 'Báo cáo đã được gửi đến email của bạn' };
  }

  private async generateCsv(transactions: any[]): Promise<Buffer> {
    const fields = [
      { 
        label: 'Ngày', 
        value: (row: any) => {
          const d = new Date(row.transaction_date);
          return !isNaN(d.getTime()) ? d.toLocaleDateString('vi-VN') : row.transaction_date;
        } 
      },
      { label: 'Danh mục', value: 'category.name' },
      { label: 'Ví', value: 'wallet.name' },
      { label: 'Loại', value: (row: any) => row.type === 'income' ? 'Thu nhập' : 'Chi tiêu' },
      { label: 'Số tiền', value: 'amount' },
      { label: 'Ghi chú', value: 'note' }
    ];

    const json2csvParser = new Parser({ fields });
    let csv = json2csvParser.parse(transactions);

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + Number(t.amount), 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + Number(t.amount), 0);
    const netBalance = totalIncome - totalExpense;

    csv += `\n`;
    csv += `\n"TỔNG KẾT"`;
    csv += `\n"Số lượng giao dịch","${transactions.length}"`;
    csv += `\n"Tổng thu nhập","${totalIncome}"`;
    csv += `\n"Tổng chi tiêu","${totalExpense}"`;
    csv += `\n"Số dư ròng","${netBalance}"`;

    return Buffer.from(csv, 'utf-8');
  }

  private async generatePdf(
    transactions: any[], 
    user: User, 
    goals: any[],
    startDate?: string, 
    endDate?: string
  ): Promise<Buffer> {
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

      const formatDate = (dateStr?: string) => {
        if (!dateStr) return null;
        try {
          const d = new Date(dateStr);
          return !isNaN(d.getTime()) ? d.toLocaleDateString('vi-VN') : dateStr;
        } catch {
          return dateStr;
        }
      };

      doc.font(regularFont).fontSize(12).text(`Người dùng: ${userName}`);
      doc.text(`Email: ${user.email}`);
      doc.text(`Thời gian: ${formatDate(startDate) || 'Mọi lúc'} - ${formatDate(endDate) || 'Hiện tại'}`);
      doc.moveDown();

      const incomeTransactions = transactions.filter(t => t.type === 'income');
      const expenseTransactions = transactions.filter(t => t.type === 'expense');
      const totalIncome = incomeTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpense = expenseTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      
      doc.font(boldFont).fontSize(14).text('1. Tóm tắt tài chính:');
      doc.font(regularFont).fontSize(12);
      doc.text(`- Tổng thu nhập: ${totalIncome.toLocaleString('vi-VN')} VND`);
      doc.text(`- Tổng chi tiêu: ${totalExpense.toLocaleString('vi-VN')} VND`);
      
      const netBalance = totalIncome - totalExpense;
      doc.font(boldFont).fillColor('black').text('- Số dư ròng: ', { continued: true })
         .fillColor(netBalance >= 0 ? 'black' : '#C62828')
         .text(`${netBalance.toLocaleString('vi-VN')} VND`);
      doc.fillColor('black');
      doc.moveDown();
      doc.moveDown();

      if (expenseTransactions.length > 0) {
        doc.font(boldFont).fontSize(14).text('2. Phân tích chi tiêu theo danh mục:');
        doc.moveDown(0.5);
        
        const catMap = new Map<string, number>();
        expenseTransactions.forEach(t => {
          const name = t.category?.name || 'Khác';
          catMap.set(name, (catMap.get(name) || 0) + Number(t.amount));
        });

        const sortedCats = Array.from(catMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        sortedCats.forEach(([name, amount]) => {
          const percent = Math.round((amount / totalExpense) * 100);
          doc.font(regularFont).fontSize(10).text(`${name}: ${amount.toLocaleString('vi-VN')} VND (${percent}%)`);
          
          const barWidth = 200;
          const currentWidth = (amount / totalExpense) * barWidth;
          const currentY = doc.y;
          
          doc.rect(50, currentY + 2, barWidth, 8).fill('#EEEEEE');
          doc.rect(50, currentY + 2, currentWidth, 8).fill('#2E7D32');
          doc.moveDown(1.5);
        });
        doc.moveDown();
      }

      const activeGoals = goals.filter(g => !g.is_completed);
      if (activeGoals.length > 0) {
        doc.fillColor('black').font(boldFont).fontSize(14).text('3. Tiến độ mục tiêu tiết kiệm:');
        doc.moveDown(0.5);

        activeGoals.forEach(g => {
          const target = Number(g.target || 0);
          const saved = Number(g.saved_amount || 0);
          const percent = target > 0 ? Math.max(0, Math.min(100, Math.round((saved / target) * 100))) : 0;
          
          doc.font(regularFont).fontSize(10).fillColor('black').text(`${g.name}: `, { continued: true })
             .fillColor(saved >= 0 ? 'black' : '#C62828')
             .text(`${saved.toLocaleString('vi-VN')}`, { continued: true })
             .fillColor('black')
             .text(` / ${target.toLocaleString('vi-VN')} VND (${percent}%)`);
          
          doc.fillColor('black');
          
          const barWidth = 200;
          const currentWidth = (percent / 100) * barWidth;
          const currentY = doc.y;
          
          doc.rect(50, currentY + 2, barWidth, 8).fill('#EEEEEE');
          doc.rect(50, currentY + 2, currentWidth, 8).fill('#1976D2');
          doc.moveDown(1.5);
        });
        doc.moveDown();
      }

      doc.fillColor('black').font(boldFont).fontSize(14).text('4. Danh sách giao dịch chi tiết:');
      doc.moveDown(0.5);

      const tableTop = doc.y;
      doc.font(boldFont).fontSize(9).fillColor('black');
      doc.text('Ngày', 50, tableTop);
      doc.text('Danh mục', 110, tableTop);
      doc.text('Ví', 210, tableTop);
      doc.text('Loại', 280, tableTop);
      doc.text('Số tiền', 340, tableTop, { width: 80, align: 'right' });
      doc.text('Ghi chú', 430, tableTop);

      doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();
      
      let y = tableTop + 25;
      doc.font(regularFont).fontSize(8);

      for (const t of transactions) {
        if (y > 700) {
          doc.addPage();
          y = 50;
        }

        const transDate = t.transaction_date ? new Date(t.transaction_date) : new Date();
        const dateStr = !isNaN(transDate.getTime()) 
          ? transDate.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) 
          : 'N/A';
          
        const isExpense = t.type === 'expense';
        doc.fillColor('black').text(dateStr, 50, y);
        doc.text(t.category?.name || 'Khác', 110, y, { width: 90 });
        doc.text(t.wallet?.name || 'N/A', 210, y, { width: 60 });
        doc.text(isExpense ? 'Chi tiêu' : 'Thu nhập', 280, y);
        
        doc.fillColor(isExpense ? '#C62828' : 'black')
           .text(`${isExpense ? '-' : ''}${Number(t.amount).toLocaleString('vi-VN')}`, 340, y, { width: 80, align: 'right' });
        
        doc.fillColor('black').text(t.note || '', 430, y, { width: 120 });

        y += 18;
      }

      doc.addPage();
      doc.fillColor('black').font(boldFont).fontSize(14).text('5. Nhận xét & Đề xuất từ MoneyCare:');
      doc.moveDown(0.5);

      const savingRate = totalIncome > 0 ? (netBalance / totalIncome) : 0;
      
      const advices: string[] = [];

      if (totalIncome > 0 && totalExpense > totalIncome) {
        advices.push('CẢNH BÁO: Chi tiêu của bạn đang vượt mức thu nhập. Hãy rà soát lại các khoản chi không thiết yếu ngay lập tức.');
      } else if (savingRate > 0.2) {
        advices.push(`KHUYẾN KHÍCH: Tuyệt vời! Bạn đang tiết kiệm được ${Math.round(savingRate * 100)}% thu nhập. Đây là tỷ lệ rất lành mạnh.`);
      }

      const catMap = new Map<string, number>();
      expenseTransactions.forEach(t => {
        const name = t.category?.name || 'Khác';
        catMap.set(name, (catMap.get(name) || 0) + Number(t.amount));
      });
      const sortedCats = Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]);
      
      if (sortedCats.length > 0 && totalExpense > 0) {
        const [topCat, topAmt] = sortedCats[0];
        const percent = (topAmt / totalExpense) * 100;
        if (percent > 40) {
          advices.push(`TỐI ƯU: Danh mục "${topCat}" đang chiếm tới ${Math.round(percent)}% tổng chi tiêu. Bạn có thể cân nhắc cắt giảm hạng mục này để gia tăng quỹ dự phòng.`);
        }
      }

      if (activeGoals.length > 0 && netBalance > 0) {
        advices.push(`MỤC TIÊU: Bạn đang có số dư ròng ${netBalance.toLocaleString('vi-VN')} VND. Hãy cân nhắc nạp thêm vào mục tiêu "${activeGoals[0].name}" để sớm hoàn thành kế hoạch.`);
      }

      if (advices.length === 0) {
        advices.push('Hãy tiếp tục duy trì thói quen ghi chép chi tiêu đầy đủ để nhận được những phân tích chi tiết hơn từ MoneyCare vào tháng tới.');
      }

      doc.font(regularFont).fontSize(11);
      advices.forEach(advice => {
        doc.fillColor('#2E7D32').text('• ', { continued: true })
           .fillColor('black').text(advice);
        doc.moveDown(0.5);
      });

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
