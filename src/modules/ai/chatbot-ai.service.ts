import { Injectable, Logger } from '@nestjs/common';
import JSON5 from 'json5';
import { GeminiService } from './gemini.service';
import { AiProvider } from '../chatbot/interfaces/ai-provider.interface';
import {
  ChatExpenseResult,
  CatOption,
  FinancialAnalysisResult,
} from '../chatbot/types/chatbot.types';

@Injectable()
export class ChatbotAiService implements AiProvider {
  private readonly logger = new Logger(ChatbotAiService.name);

  constructor(private readonly gemini: GeminiService) {}

  async parseExpense(message: string, options: CatOption[]): Promise<ChatExpenseResult> {
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
      const result = await this.gemini.generateContent(prompt);
      const output = result.response.text();
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
      return {
        amount: null,
        category_name: null,
        description: null,
        time: null,
        confidence: 0,
      };
    }
  }

  async analyzeFinancialHealth(
    text: string,
    categories: CatOption[],
    historyData: string,
    userName: string,
  ): Promise<FinancialAnalysisResult | string> {
    const list = categories.map((c) => `- ${c.name}`).join('\n');
    const prompt = `
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

OUTPUT FORMAT (JSON DUY NHẤT):
{
  "summary": string,
  "budget_plan": [
    {
      "group_name": string,
      "items": [
        { "name": string, "amount": number, "description": string }
      ]
    }
  ]
}

HẠNG MỤC APP:
${list}

DỮ LIỆU:
${historyData}

YÊU CẦU: ${text}
`.trim();

    try {
      const result = await this.gemini.generateContent(prompt);
      let raw = result.response.text().trim();
      if (raw.startsWith('```')) {
        raw = raw.replace(/```[\w]*\n?/g, '').replace(/```$/, '').trim();
      }
      return JSON5.parse(raw) as FinancialAnalysisResult;
    } catch (e) {
      this.logger.error('Parse Analysis JSON failed', e);
      return 'Tôi gặp lỗi khi chuẩn bị kế hoạch tài chính cho bạn. Hãy thử lại nhé!';
    }
  }

  async chatAnswer(text: string): Promise<string> {
    const prompt = `Bạn là trợ lý tài chính Money Care. Hãy trả lời thân thiện: ${text}`;
    const result = await this.gemini.generateContent(prompt);
    return result.response.text().trim();
  }
}
