import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import JSON5 from 'json5';
import { ReceiptScanResult } from './types/receipt.types';
import { ReceiptProvider } from './interfaces/receipt-provider.interface';

@Injectable()
export class AiGeminiReceiptService implements ReceiptProvider {
  private readonly logger = new Logger(AiGeminiReceiptService.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY');
    this.ai = new GoogleGenAI({ apiKey });
  }

  private buildPrompt(): string {
    return `
Bạn là chuyên gia OCR phân tích hóa đơn cho ứng dụng "Money Care".

NHIỆM VỤ:
Trích xuất thông tin chi tiết từ ẢNH HÓA ĐƠN.

OUTPUT FORMAT (DUY NHẤT 1 JSON):
{
  "merchant_name": string | null,
  "date": string | null, // YYYY-MM-DD
  "total_amount": number | null,
  "items": [
    { "name": string, "amount": number, "category": string }
  ]
}

QUY TẮC:
- "merchant_name": Tên thương hiệu/cửa hàng.
- "total_amount": Tổng tiền thanh toán cuối cùng (number).
- "items": Danh sách các mặt hàng/dịch vụ trong hóa đơn.
- Gợi ý "category" cho từng item dưa trên tên của nó (vd: "Ăn uống", "Mua sắm", "Di chuyển", "Hóa đơn", "Sức khỏe", "Giáo dục", "Khác").
- Chỉ trả JSON, không giải thích gì thêm.
`.trim();
  }

  private preview(text: string, max = 400): string {
    return text && text.length > max ? text.slice(0, max) + '...' : text;
  }

  private cleanModelOutput(raw: string): string {
    let cleaned = raw.trim();

    if (cleaned.startsWith('```')) {
      cleaned = cleaned
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/, '')
        .trim();
    }
    return cleaned;
  }

  private extractTextFromGemini(res: any): string {
    const text =
      res?.candidates?.[0]?.content?.parts?.[0]?.text ?? res?.text ?? '';

    return typeof text === 'string' ? text : '';
  }

  private parseJsonSafe(raw: string): ReceiptScanResult {
    try {
      const parsed = JSON5.parse(raw);

      return {
        merchant_name: parsed.merchant_name ?? null,
        date: parsed.date ?? null,
        total_amount: parsed.total_amount ?? null,
        items: (parsed.items || []).map((i: any) => ({
          name: i.name || 'Không rõ',
          amount: Number(i.amount) || 0,
          category: i.category || 'Khác',
        })),
      };
    } catch (err) {
      this.logger.error('JSON parse lỗi:', err);
      throw new Error('Gemini trả JSON sai định dạng');
    }
  }

  private getMimeType(buffer: Buffer): string {
    const signature = buffer.slice(0, 4).toString('hex').toLowerCase();
    if (signature.startsWith('89504e47')) return 'image/png';
    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('52494646') && buffer.includes(Buffer.from('WEBP')))
      return 'image/webp';
    return 'image/jpeg';
  }

  async scan(imageBuffer: Buffer): Promise<ReceiptScanResult> {
    this.logger.log(`[SCAN] Start, buffer = ${imageBuffer.length} bytes`);

    const base64 = imageBuffer.toString('base64');
    const mimeType = this.getMimeType(imageBuffer);

    const res = await this.ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: this.buildPrompt() },
            { inlineData: { data: base64, mimeType } },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 2000,
      },
    });

    const raw = this.extractTextFromGemini(res);
    const cleaned = this.cleanModelOutput(raw);

    this.logger.log('[SCAN] Output preview = ' + this.preview(cleaned));

    const result = this.parseJsonSafe(cleaned);

    this.logger.log(
      '[SCAN] FINAL = ' + this.preview(JSON.stringify(result), 500),
    );

    return result;
  }
}
