export interface VCBParsedTransaction {
  amount: number;
  currency: 'VND';
  transactionTime: Date;
  direction: 'IN' | 'OUT';
  senderName?: string;
  senderAccount?: string;
  receiverName?: string;
  receiverAccount?: string;
  bankName?: string;
  description?: string;
  orderNumber?: string | null;
}

export class VCBEmailParser {
  static parse(html: string): VCBParsedTransaction | null {
    try {
      // Loại bỏ tất cả thẻ HTML và normalize khoảng trắng
      const text = html
        .replace(/<[^>]*>/g, ' ') // Thay thế tất cả thẻ HTML bằng space
        .replace(/\s+/g, ' ') // Gộp nhiều khoảng trắng thành 1
        .trim();

      // Parse các trường dữ liệu
      const orderNumber = this.extractField(
        text,
        /Số lệnh giao dịch\s+Order Number\s+(\d+)/i,
      );

      const senderAccount = this.extractField(
        text,
        /Tài khoản nguồn\s+Debit Account\s+(\d+)/i,
      );

      const senderName = this.extractField(
        text,
        /Tên người chuyển tiền\s+Remitter's name\s+([\w\s]+?)(?=Tài khoản người hưởng|$)/i,
      );

      const receiverAccount = this.extractField(
        text,
        /Tài khoản người hưởng\s+Credit Account\s+([\w\d]+?)(?=Tên người hưởng|$)/i,
      );

      const receiverName = this.extractField(
        text,
        /Tên người hưởng\s+Beneficiary Name\s+([\w\s]+?)(?=Tên ngân hàng|$)/i,
      );

      const bankName = this.extractField(
        text,
        /Tên ngân hàng hưởng\s+Beneficiary Bank Name\s+([\w\s]+?)(?=Số tiền|$)/i,
      );

      const amountRaw = this.extractField(
        text,
        /Số tiền\s+Amount\s+([\d,]+)\s*VND/i,
      );

      const description = this.extractField(
        text,
        /Nội dung chuyển tiền\s+Details of Payment\s+(.+?)(?=Cám ơn|$)/i,
      );

      // Validate required fields
      if (!amountRaw) {
        console.error('Missing required fields:', { amountRaw });
        return null;
      }

      // Parse amount
      const amount = Number(amountRaw.replace(/,/g, ''));
      if (Number.isNaN(amount)) {
        console.error('Invalid amount:', amountRaw);
        return null;
      }

      return {
        amount,
        currency: 'VND',
        transactionTime: new Date(),
        direction: 'OUT',
        senderAccount: senderAccount || undefined,
        senderName: senderName || undefined,
        receiverAccount: receiverAccount || undefined,
        receiverName: receiverName || undefined,
        bankName: bankName || undefined,
        description: description || undefined,
        orderNumber: orderNumber || null,
      };
    } catch (error) {
      console.error('Parse error:', error);
      return null;
    }
  }

  private static extractField(text: string, regex: RegExp): string | null {
    const match = text.match(regex);
    return match ? match[1].trim() : null;
  }

  private static parseVietnameseDate(input: string): Date {
    // Input format: "18:05 Chủ Nhật 14/12/2025"
    const match = input.match(
      /(\d{2}):(\d{2})\s+\w+\s+(\d{2})\/(\d{2})\/(\d{4})/,
    );

    if (!match) {
      console.error('Date parse failed:', input);
      return new Date();
    }

    const [, hh, mm, dd, MM, yyyy] = match;

    // Tạo date string theo format ISO
    return new Date(`${yyyy}-${MM}-${dd}T${hh}:${mm}:00+07:00`);
  }
}
