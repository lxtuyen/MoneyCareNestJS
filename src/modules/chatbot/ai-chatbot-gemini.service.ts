import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import JSON5 from 'json5';
import { AiProvider } from './interfaces/ai-provider.interface';
import {
  ChatExpenseResult,
  CatOption,
  FinancialAnalysisResult,
} from './types/chatbot.types';

@Injectable()
export class AiGeminiChatbotService implements AiProvider {
  private readonly logger = new Logger(AiGeminiChatbotService.name);
  private readonly ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY');
    this.ai = new GoogleGenAI({ apiKey });
  }

  private buildExpensePrompt(categories: CatOption[]): string {
    const list = categories.map((c) => `- ${c.name}`).join('\n');
    return `
      Bạn là API xử lý câu lệnh "ghi chép chi tiêu" tiếng Việt cho app quản lý chi tiêu Money Care.

      NHIỆM VỤ:
      Trích xuất thông tin chi tiêu từ tin nhắn của người dùng.

      OUTPUT FORMAT (BẮT BUỘC):
      - Trả về DUY NHẤT 1 JSON hợp lệ (không markdown, không \`\`\`, không giải thích).
      - Nếu tin nhắn KHÔNG phải là ghi chép chi tiêu: trả về JSON với amount=null, confidence=0.
      - JSON phải có cấu trúc sau:
      {
        "time": string | null,
        "amount": number | null,
        "currency": string | null,
        "category_name": string | null,
        "description": string | null,
        "confidence": number
      }

    QUY TẮC NHẬN DIỆN & TRÍCH XUẤT:
    - Nhận diện các cụm từ như "ăn cơm 30k", "đổ xăng 50", "trả tiền điện 500k hôm qua",...
    - QUY TẮC CHUẨN HÓA SỐ TIỀN:
      - "20k" => 20000; "20" => 20000 (ngầm 20k nếu ngữ cảnh hợp lý)
      - "1tr" => 1000000; "1.2tr" => 1200000
      - "50.000" / "50,000" => 50000
      - Currency mặc định là "VND" nếu không rõ.

    - QUY TẮC THỜI GIAN:
      - "hôm nay"/"nay" => time="today"
      - "hôm qua"/"qua" => time="yesterday"
      - "dd/mm" => time="dd/mm"
      - Nếu không có => time=null

    DANH SÁCH CATEGORY (CHỈ CHỌN TRONG DANH SÁCH NÀY):
    ${list}

    YÊU CẦU:
    - category_name: Phải khớp 100% với tên trong danh sách trên.
    - description: Nội dung chi tiết (vd: "ăn trưa", "đổ xăng ninja lead").
    - confidence: 0..1 (Độ tin cậy của việc đây là một lệnh ghi chép chi tiêu).
`.trim();
  }

  private buildAnalysisPrompt(
    categories: CatOption[],
    userName: string,
  ): string {
    const list = categories.map((c) => `- ${c.name}`).join('\n');
    return `
      Bạn là chuyên gia tài chính cá nhân cho ứng dụng "Money Care".
      Tên người dùng: ${userName}.

      NHIỆM VỤ:
      Dựa trên danh sách giao dịch và số dư các quỹ của người dùng, hãy đưa ra:
      1. Nhận xét về tình hình chi tiêu gần đây.
      2. Cảnh báo nếu có hạng mục nào chi tiêu vượt quá mức bình thường.
      3. Đưa ra 3 lời khuyên cụ thể để tiết kiệm hoặc quản lý tiền tốt hơn.
      4. Gợi ý một kế hoạch ngân sách sơ bộ cho tháng tới.

      PHONG CÁCH:
      - Thân thiện, chuyên nghiệp, truyền cảm hứng.
      - Trả lời bằng tiếng Việt.
      - Sử dụng emoji để sinh động.
      - Ngắn gọn, súc tích (khoảng 300-500 từ).

      OUTPUT FORMAT (BẮT BUỘC):
      - Trả về DUY NHẤT 1 JSON (không markdown, không \`\`\`, không giải thích).
      - JSON cấu trúc:
      {
        "summary": "Lời chào và tóm tắt ngắn gọn",
        "budget_plan": [
          {
            "group_name": "Tên nhóm (vd: Nhu yếu phẩm)",
            "items": [
              { "name": "Tên mục", "amount": number, "description": "Lý do/Lời khuyên ngắn" }
            ]
          }
        ]
      }

      DANH SÁCH HẠNG MỤC CHI TIÊU CỦA APP (HÃY GỢI Ý DỰA TRÊN CÁC HẠNG MỤC NÀY):
      ${list}
`.trim();
  }

  private preview(text: string, max = 1000) {
    if (!text) return text;
    return text.length > max ? text.slice(0, max) + '...' : text;
  }

  async parseExpense(message: string, options: CatOption[]): Promise<any> {
    const prompt = `
Bạn là trợ lý ghi chép chi tiêu. Hãy trích xuất dữ liệu từ câu: "${message}"

OUTPUT FORMAT (JSON DUY NHẤT):
{
  "amount": number | null,
  "category_name": string | null,
  "description": string | null,
  "time": string | null
}

DANH SÁCH HẠNG MỤC HỢP LỆ:
${options.map((o) => `- ${o.name}`).join('\n')}

QUY TẮC:
- "amount": số tiền (number).
- "category_name": chọn 1 tên từ danh sách trên gần nhất, không có thì "Khác".
- "description": ghi chú ngắn gọn về khoản chi.
- "time": thời gian (ISO 8601) nếu người dùng nhắc đến, không thì null.
- Chỉ trả JSON.
`.trim();

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      const output = result.text || '';
      const cleaned = output.replace(/```json|```/g, '').trim();
      const parsed = JSON5.parse(cleaned);

      return {
        amount: parsed.amount ?? null,
        category_name: parsed.category_name ?? 'Khác',
        description: parsed.description ?? message,
        time: parsed.time ?? null,
        confidence: parsed.amount ? 1.0 : 0.0,
      };
    } catch (error) {
      this.logger.error('Lỗi parse chi tiêu:', error);
      return { confidence: 0 };
    }
  }

  async analyzeFinancialHealth(
    text: string,
    categories: CatOption[],
    historyData: string,
    userName: string,
  ): Promise<FinancialAnalysisResult | string> {
    const prompt = this.buildAnalysisPrompt(categories, userName);

    const res = await this.ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              text: `Dữ liệu lịch sử giao dịch & Quỹ hiện tại: \n${historyData}`,
            },
            { text: `Câu hỏi/Yêu cầu của người dùng: ${text}` },
          ],
        },
      ],
      config: { temperature: 0.7, maxOutputTokens: 2000 },
    });

    let raw = (res.text || '').trim();
    if (raw.startsWith('```')) {
      raw = raw
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/, '')
        .trim();
    }

    try {
      return JSON5.parse(raw) as FinancialAnalysisResult;
    } catch (e) {
      this.logger.error('Parse Analysis JSON failed: ' + raw, e);
      return raw;
    }
  }

  async chatAnswer(text: string): Promise<string> {
    const res = await this.ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Bạn là trợ lý tài chính cá nhân của ứng dụng Money Care. Trả lời tiếng Việt thân thiện, ngắn gọn. Hãy giúp người dùng quản lý tiền bạc thông minh hơn.',
            },
            { text },
          ],
        },
      ],
      config: { temperature: 0.7, maxOutputTokens: 1000 },
    });

    return (res.text || '').trim();
  }
}
