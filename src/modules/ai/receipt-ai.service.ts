import { Injectable, Logger } from '@nestjs/common';
import JSON5 from 'json5';
import { GeminiService } from './gemini.service';
import { ReceiptProvider } from '../receipt/interfaces/receipt-provider.interface';
import { ReceiptScanResult } from '../receipt/types/receipt.types';
import { CatOption } from '../chatbot/types/chatbot.types';

@Injectable()
export class ReceiptAiService implements ReceiptProvider {
  private readonly logger = new Logger(ReceiptAiService.name);

  constructor(private readonly gemini: GeminiService) {}

  private getMimeType(buffer: Buffer): string {
    const signature = buffer.toString('hex', 0, 4);
    if (signature.startsWith('89504e47')) return 'image/png';
    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('52494646')) return 'image/webp';
    return 'image/jpeg';
  }

  async scan(
    imageBuffer: Buffer,
    categories?: CatOption[],
  ): Promise<ReceiptScanResult> {
    const mimeType = this.getMimeType(imageBuffer);
    const catList = categories?.map((c) => `- ${c.name}`).join('\n') || '';

    const prompt = `
Bạn là chuyên gia OCR phân tích hóa đơn cho ứng dụng "Money Care".

NHIỆM VỤ:
Trích xuất thông tin chi tiết từ ẢNH HÓA ĐƠN.

OUTPUT FORMAT (JSON DUY NHẤT):
{
  "merchant_name": string | null,
  "date": string | null,
  "total_amount": number | null,
  "items": [
    { "name": string, "amount": number, "category": string, "categoryId": number | null }
  ]
}

QUY TẮC:
- "merchant_name": Tên thương hiệu/cửa hàng.
- "total_amount": Tổng tiền thanh toán cuối cùng (number).
- "items": Danh sách các mặt hàng/dịch vụ.
- "categoryId": Dựa vào DANH SÁCH HẠNG MỤC dưới đây, hãy chọn ID phù hợp nhất cho món hàng đó. Nếu không khớp, để null.
- "category": Tên hạng mục tương ứng với categoryId (nếu có), hoặc gợi ý 1 tên.

DANH SÁCH HẠNG MỤC HIỆN CÓ:
${catList}

- Chỉ trả JSON.
`.trim();

    try {
      const result = await this.gemini.generateContent(
        prompt,
        imageBuffer,
        mimeType,
      );
      const output = result.response.text();
      const cleaned = output.replace(/```json|```/g, '').trim();
      const parsed = JSON5.parse(cleaned);

      return {
        merchant_name: parsed.merchant_name ?? null,
        date: parsed.date ?? null,
        total_amount: parsed.total_amount ?? null,
        items: (parsed.items || []).map((i: any) => ({
          name: i.name || 'Không rõ',
          amount: Number(i.amount) || 0,
          category: i.category || 'Khác',
          categoryId: i.categoryId ?? null,
        })),
      };
    } catch (err) {
      this.logger.error('Lỗi quét hóa đơn:', err);
      return {
        merchant_name: null,
        date: null,
        total_amount: null,
        items: [],
      };
    }
  }
}
