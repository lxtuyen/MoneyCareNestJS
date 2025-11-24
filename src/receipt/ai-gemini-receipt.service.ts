import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { ReceiptScanResult } from './receipt.types';
import JSON5 from 'json5';

@Injectable()
export class AiGeminiReceiptService {
  private readonly logger = new Logger(AiGeminiReceiptService.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY');
    this.ai = new GoogleGenAI({ apiKey });
  }


  private buildPrompt(): string {
    return `
Bạn là API phân tích hoá đơn.

Nhận 1 ẢNH HÓA ĐƠN và trả về DUY NHẤT MỘT JSON hợp lệ với schema:

{
  "raw_text": string,
  "merchant_name": string | null,
  "address": string | null,
  "date": string | null,
  "total_amount": number | null,
  "currency": string | null,
  "category_key": string,
  "category_name": string,
  "confidence": number
}

Ý NGHĨA:
- "raw_text": toàn bộ nội dung text bạn đọc được từ hoá đơn (text thuần, có thể giữ xuống dòng).
- "merchant_name": tên cửa hàng/quán.
- "address": địa chỉ nếu đọc được, không có thì null.
- "date": ngày hoá đơn, format YYYY-MM-DD.
- "total_amount": tổng tiền cuối cùng (đã gồm thuế/phí nếu có).
- "currency": mã tiền tệ, ví dụ "VND", "USD", nếu không rõ thì "VND" nếu ngữ cảnh ở Việt Nam.
- "category_key": 1 trong các key: "FOOD", "SHOPPING", "TRANSPORT", "BILL", "HEALTH", "EDU", "OTHER".
- "category_name": tên tiếng Việt tương ứng (Ăn uống, Mua sắm, Di chuyển, Hóa đơn, Sức khỏe, Giáo dục, Khác).
- "confidence": số từ 0 đến 1 thể hiện độ tự tin.

QUY TẮC PHÂN LOẠI:
- Cafe, trà sữa, đồ uống, nhà hàng, món ăn → FOOD (Ăn uống)
- Cửa hàng tiện lợi, siêu thị, tạp hoá → SHOPPING (Mua sắm)
- Taxi, Grab, bus, vé xe, xăng, gửi xe → TRANSPORT (Di chuyển)
- Điện, nước, internet, mobile, truyền hình → BILL (Hóa đơn)
- Học phí, sách vở, trung tâm, trường học → EDU (Giáo dục)
- Thuốc, phòng khám, bệnh viện hoặc Không khớp → OTHER (Khác)

YÊU CẦU:
- CHỈ TRẢ JSON — không được trả bất cứ văn bản nào ngoài JSON.
- KHÔNG dùng markdown, KHÔNG dùng \`\`\`.
- KHÔNG giải thích, KHÔNG mô tả thêm.
- Nếu thiếu dữ liệu → dùng null nhưng vẫn phải giữ field.
- "total_amount" phải là number thật, KHÔNG dùng dấu . hoặc , để phân tách hàng nghìn.
  Ví dụ: 947.100₫ → total_amount = 947100
- "date" phải ở định dạng YYYY-MM-DD. Nếu đọc được nhiều ngày, chọn ngày gần với “ngày in/transaction” nhất.
`.trim();
  }

  private preview(text: string, max = 400): string {
    if (!text) return text;
    return text.length > max ? text.slice(0, max) + '...' : text;
  }


  async scan(imageBuffer: Buffer): Promise<ReceiptScanResult> {
    this.logger.log(
      `🚀 [SCAN] Start, imageBuffer = ${imageBuffer.length} bytes`,
    );

    const base64 = imageBuffer.toString('base64');
    this.logger.log(`📸 [SCAN] Base64 length = ${base64.length}`);

    const prompt = this.buildPrompt();

    const res = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { data: base64, mimeType: 'image/jpeg' } },
          ],
        },
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 1200,
      },
    });

    let raw = (res.text || '').trim();
    this.logger.log('📥 [SCAN] Gemini RAW preview = ' + this.preview(raw));

    if (raw.startsWith('```')) {
      raw = raw.replace(/```[\w]*\n?/g, '').replace(/```$/, '').trim();
      this.logger.log('🧹 [SCAN] cleaned preview = ' + this.preview(raw));
    }

    try {
      const parsed = JSON5.parse(raw) as ReceiptScanResult;

      if (!parsed.raw_text) {
        this.logger.warn('⚠️ [SCAN] Model không trả raw_text, fallback = ""');
        parsed.raw_text = '';
      }

      this.logger.log(
        '🎉 [SCAN] FINAL RESULT = ' + this.preview(JSON.stringify(parsed), 500),
      );
      return parsed;
    } catch (err) {
      this.logger.error('❌ [SCAN] Parse JSON failed', err);
      this.logger.error('❌ [SCAN] JSON full = ' + raw);
      throw new Error('Gemini trả JSON không hợp lệ');
    }
  }
}
