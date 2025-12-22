import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import JSON5 from 'json5';
import { CatOption, ChatExpenseResult } from './chatbot.types';

@Injectable()
export class AiGeminiChatbotService {
  private readonly logger = new Logger(AiGeminiChatbotService.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY');
    this.ai = new GoogleGenAI({ apiKey });
  }

  private buildExpensePrompt(categories: CatOption[]): string {
    const list = categories.map((c) => `- ${c.name}`).join('\n');
    this.logger.log('Categories list: ' + list);
    return `
      Bạn là API xử lý câu lệnh "thêm chi tiêu" tiếng Việt cho app quản lý chi tiêu.

      OUTPUT FORMAT (BẮT BUỘC):
      - Trả về DUY NHẤT 1 JSON hợp lệ (không markdown, không \`\`\`, không giải thích).
      - JSON phải có ĐỦ các key đúng thứ tự sau:
      {
        "time": string | null,
        "amount": number | null,
        "currency": string | null,
        "category_name": string | null,
        "description": string | null,
        "confidence": number
      }

    QUY TẮC NHẬN DIỆN:
    - Chỉ xử lý nếu câu bắt đầu bằng đúng "thêm chi tiêu".
    - Nếu KHÔNG bắt đầu bằng "thêm chi tiêu": trả về JSON với amount=null, category_name=null, confidence=0 (các field khác null).

    QUY TẮC CHUẨN HÓA SỐ TIỀN:
    - "20k" => 20000; "20" => 20000 (ngầm 20k)
    - "1tr" => 1000000; "1tr2" => 1200000; "1.2tr" => 1200000; "1tr 200" => 1200000
    - "50.000" / "50,000" => 50000
    - Nếu có "đ", "vnd" => currency="VND"
    - Nếu không thấy currency => currency="VND"
    - Nếu không xác định được số tiền => amount=null và confidence giảm.

    QUY TẮC THỜI GIAN:
    - Nếu có "hôm nay"/"nay" => time="today"
    - "hôm qua"/"qua" => time="yesterday"
    - Nếu có dạng "dd/mm" hoặc "dd-mm" => time = đúng chuỗi ngày đó (giữ nguyên như user viết)
    - Nếu không có thông tin => time=null

    GỢI Ý PHÂN LOẠI (match theo từ khóa, ưu tiên theo thứ tự ở phần ƯU TIÊN):
    - Ăn uống: bánh mì, cơm, phở, bún, mì, cháo, đồ ăn, ăn, quán ăn, nhà hàng,
      cafe/cà phê, trà sữa, trà, nước, nước ngọt, ăn vặt, snack, bánh kẹo,
      đặt đồ ăn: grabfood, shopeefood/now, befood.
      "đi chợ" chỉ là Ăn uống nếu có dấu hiệu thực phẩm: rau củ, thịt, cá, trứng, sữa, gạo, mì...

    - Mua sắm: siêu thị, tạp hoá, cửa hàng tiện lợi (circle k, familymart, winmart, coopmart...),
      mua đồ, shopping, quần áo, giày dép, mỹ phẩm, dầu gội, sữa tắm, đồ gia dụng,
      mua hàng online: shopee, lazada, tiki (nếu không nói rõ là đồ ăn).

    - Di chuyển: grab, be, gojek, taxi, xe ôm, bus, vé xe, vé tàu,
      xăng/đổ xăng, gửi xe, rửa xe, sửa xe, bảo dưỡng.

    - Hóa đơn: điện, nước, internet, wifi, 4g/5g, data, cước/thuê bao,
      thanh toán định kỳ (nếu không có category riêng).

    - Giáo dục: học phí, tiền học, sách, giáo trình, in/ấn, photo, tài liệu, khóa học, lệ phí thi.

    - Khác: không khớp rõ ràng với các nhóm trên.

    ƯU TIÊN CHỐNG NHẦM (rất quan trọng):
    1) Nếu có từ khóa rõ ràng (grabfood/shopeefood/now/cafe/trà sữa...) => ưu tiên Ăn uống.
    2) Nếu có "đi chợ" + đồ dùng (dầu gội, sữa tắm, đồ gia dụng...) => ưu tiên Mua sắm.
    3) Nếu vừa có "grab" vừa có "ăn/đồ ăn/grabfood" => ưu tiên Ăn uống (grabfood).
    4) Nếu mơ hồ/không chắc => chọn "Khác" nếu có trong DANH SÁCH CATEGORY, và confidence thấp.

    DANH SÁCH CATEGORY (category_name CHỈ ĐƯỢC CHỌN TRONG NÀY, phải khớp đúng 100%):
    ${list}

    YÊU CẦU CUỐI:
    - category_name: nếu có thể, MUST chọn 1 giá trị trong danh sách. Nếu không chắc và có "Khác" trong danh sách => chọn "Khác".
    - description: ghi ngắn gọn nội dung chi tiêu (vd: "cafe", "đổ xăng", "mua dầu gội"...). Nếu user không nói gì => null.
    - confidence: 0..1 (chắc thì cao, mơ hồ thì thấp).
`.trim();
  }

  private preview(text: string, max = 1000) {
    if (!text) return text;
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  async parseExpense(
    text: string,
    categories: CatOption[],
  ): Promise<ChatExpenseResult> {
    const prompt = this.buildExpensePrompt(categories);

    const res = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025',
      contents: [{ role: 'user', parts: [{ text: prompt }, { text }] }],
      config: { temperature: 0.1, maxOutputTokens: 5000 },
    });

    let raw = (res.text || '').trim();
    this.logger.log('📥 [EXPENSE] RAW=' + this.preview(raw));

    if (raw.startsWith('```')) {
      raw = raw
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/, '')
        .trim();
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const parsed = JSON5.parse(raw) as ChatExpenseResult;

      if (!parsed.currency) parsed.currency = 'VND';
      if (typeof parsed.confidence !== 'number') parsed.confidence = 0;
      if (typeof parsed.amount !== 'number') parsed.amount = null;
      if (typeof parsed.category_name !== 'string') parsed.category_name = null;
      if (typeof parsed.description !== 'string') parsed.description = null;

      return parsed;
    } catch (e) {
      this.logger.error(' Parse JSON failed', e);
      this.logger.error('JSON full=' + raw);
      throw new Error('Gemini trả JSON không hợp lệ');
    }
  }

  async chatAnswer(text: string): Promise<string> {
    const res = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Bạn là trợ lý tài chính cá nhân. Trả lời tiếng Việt ngắn gọn.',
            },
            { text },
          ],
        },
      ],
      config: { temperature: 0.7, maxOutputTokens: 700 },
    });

    return (res.text || '').trim();
  }
}
