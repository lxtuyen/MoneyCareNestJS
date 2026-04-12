import { BadRequestException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import JSON5 from 'json5';
import { GoogleGenAI, Type } from '@google/genai';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Fund, FundType } from 'src/modules/saving-funds/entities/fund.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import {
  CatOption,
  ChatExpenseResult,
  FinancialAnalysisResult,
  ReceiptScanResult,
} from './types/ai.types';

const MODEL = 'gemma-4-31b-it';

function normalizeAmount(amount: number | null): number | null {
  if (!amount || amount <= 0) return null;
  if (amount < 1000) return amount * 1000;
  return Math.round(amount);
}

function norm(s: string) {
  return (s || '').trim().toLowerCase();
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenAI;

  constructor(
    private readonly transactionService: TransactionService,

    @InjectRepository(Fund)
    private readonly fundRepo: Repository<Fund>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Thiếu GEMINI_API_KEY trong biến môi trường');
    }
    this.genAI = new GoogleGenAI({ apiKey });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async generateContent(prompt: string, image?: Buffer, mimeType?: string) {
    const parts: any[] = [{ text: prompt }];
    if (image && mimeType) {
      parts.push({ inlineData: { data: image.toString('base64'), mimeType } });
    }
    return this.genAI.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
    });
  }

  private async getSelectedFund(userId: number): Promise<Fund | null> {
    // Ưu tiên quỹ đang được chọn
    const selected = await this.fundRepo.findOne({
      where: { user: { id: userId }, is_selected: true },
      order: { updated_at: 'DESC' },
    });
    if (selected) return selected;

    // Fallback: lấy quỹ SPENDING đầu tiên của user
    return this.fundRepo.findOne({
      where: { user: { id: userId }, type: FundType.SPENDING },
      order: { updated_at: 'DESC' },
    });
  }

  private async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return this.categoryRepo.find({
      where: { user: { id: userId } },
      order: { id: 'ASC' },
    });
  }

  private async getCategoriesByFundId(fundId: number): Promise<Category[]> {
    return this.categoryRepo.find({
      where: { fund: { id: fundId } },
      order: { id: 'ASC' },
    });
  }

  private async getCategories(userId: number, fundId?: number): Promise<Category[]> {
    // Ưu tiên fundId được truyền lên từ App
    if (fundId && fundId > 0) {
      const fundCats = await this.getCategoriesByFundId(fundId);
      if (fundCats.length > 0) return fundCats;
    }

    // Nếu không có fundId truyền lên, tìm quỹ đang được chọn trong DB
    const fund = await this.getSelectedFund(userId);
    if (fund) {
      const fundCats = await this.getCategoriesByFundId(fund.id);
      if (fundCats.length > 0) return fundCats;
    }
    // Fallback: category gắn thẳng với user
    return this.getCategoriesByUserId(userId);
  }

  private pickCategoryByName(cats: Category[], name: string | null): Category {
    const g = norm(name || '');
    return (
      cats.find((c) => norm(c.name) === g) ||
      cats.find((c) => norm(c.name).includes(g) || g.includes(norm(c.name))) ||
      cats.find((c) => norm(c.name).includes('khác')) ||
      cats[0]
    );
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────────

  async handle(
    message: string | undefined,
    userIdRaw: any,
    file?: Express.Multer.File,
    fundId?: number,
  ): Promise<ApiResponse<string>> {
    const userId: number = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId phải là number');
    }

    if (file) {
      const cats = await this.getCategories(userId, fundId);
      const categories: CatOption[] = cats.map((c) => ({ id: c.id, name: c.name }));
      const scanResult = await this.scanReceipt(file.buffer, categories);
      return {
        success: true,
        statusCode: 200,
        message: `__STRUCTURED_RECEIPT__${JSON.stringify(scanResult)}`,
      };
    }

    const lowerMsg = (message || '').toLowerCase();
    const isAnalysisRequest =
      lowerMsg.includes('phân tích') ||
      lowerMsg.includes('kế hoạch') ||
      lowerMsg.includes('ngân sách') ||
      lowerMsg.includes('khuyên');

    if (isAnalysisRequest) {
      return this.handleAnalysis(message ?? '', userId, fundId);
    }
    
    const cats = await this.getCategories(userId, fundId);
    if (cats.length === 0) {
      const answer = await this.chatAnswer(message ?? '');
      return { success: true, statusCode: 200, message: answer };
    }

    const options: CatOption[] = cats.map((c) => ({ id: c.id, name: c.name }));
    const out = await this.parseExpense(message ?? '', options);

    if (out.confidence > 0.6 && out.amount) {
      const amount = normalizeAmount(out.amount);
      const picked = this.pickCategoryByName(cats, out.category_name);
      if (amount && picked) {
        const dto: CreateTransactionDto = {
          userId,
          type: 'expense',
          amount,
          note: out.description ?? 'Chi tiêu từ Chatbot',
          transactionDate: out.time || new Date().toISOString(),
          categoryId: picked.id,
        };
        await this.transactionService.create(dto);
        const savedData = {
          amount,
          category: picked.name,
          categoryIcon: picked.icon ?? '💰',
          note: out.description ?? message ?? '',
          date: dto.transactionDate,
        };
        return {
          success: true,
          statusCode: 200,
          message: `__TRANSACTION_SAVED__${JSON.stringify(savedData)}`,
        };
      }
    }

    const answer = await this.chatAnswer(message ?? '');
    return { success: true, statusCode: 200, message: answer };
  }

  private async handleAnalysis(
    message: string,
    userId: number,
    fundId?: number,
  ): Promise<ApiResponse<string>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });
    const fund = fundId ? await this.fundRepo.findOne({ where: { id: fundId } }) : await this.getSelectedFund(userId);

    const now = new Date();
    const lastMonth = new Date();
    lastMonth.setDate(now.getDate() - 30);

    const transactionsRes = await this.transactionService.findAllByFilter({
      userId,
      startDate: lastMonth.toISOString(),
      endDate: now.toISOString(),
      fundId: fund?.id,
    });

    const expenses = transactionsRes.data?.expense || [];
    const income = transactionsRes.data?.income || [];

    const categoryTotals: Record<string, number> = {};
    expenses.forEach((t) => {
      const catName = t.category?.name || 'Khác';
      categoryTotals[catName] = (categoryTotals[catName] || 0) + Number(t.amount);
    });

    const aggregatedData = Object.entries(categoryTotals)
      .map(([name, total]) => `- ${name}: ${total.toLocaleString('vi-VN')} VND`)
      .join('\n');

    const funds = await this.fundRepo.find({ where: { user: { id: userId } } });
    const cats = fund ? await this.getCategoriesByFundId(fund.id) : [];

    const historySummary = `
KHOẢNG THỜI GIAN: 30 ngày qua
TỔNG CHI TIÊU THEO HẠNG MỤC:
${aggregatedData || 'Chưa có chi tiêu.'}

TỔNG THU NHẬP: ${income.reduce((sum, t) => sum + Number(t.amount || 0), 0).toLocaleString('vi-VN')} VND

DANH SÁCH QUỸ:
${funds.map((f) => `- ${f.name}: Số dư ${f.balance.toLocaleString('vi-VN')} VND (Mục tiêu: ${(f.target || 0).toLocaleString('vi-VN')} VND)`).join('\n')}
    `.trim();

    const options = cats.map((c) => ({ id: c.id, name: c.name }));
    const userName =
      user?.profile
        ? `${user.profile.first_name || ''} ${user.profile.last_name || ''}`.trim()
        : 'Người dùng';

    const analysis = await this.analyzeFinancialHealth(
      message,
      options,
      historySummary,
      userName || 'Người dùng',
    );

    const resultString =
      typeof analysis === 'object'
        ? `__STRUCTURED_ANALYSIS__${JSON.stringify(analysis)}`
        : analysis;

    return { success: true, statusCode: 200, message: resultString };
  }

  async bulkCreateTransactions(userId: number, items: any[], fundId?: number): Promise<void> {
    const cats = await this.getCategories(userId, fundId);
    if (!cats.length) throw new BadRequestException('Người dùng chưa có hạng mục chi tiêu');

    const now = new Date().toISOString();
    for (const item of items) {
      const amount = normalizeAmount(item.amount);
      if (!amount || amount <= 0) continue;

      const categoryId = item.categoryId ?? this.pickCategoryByName(cats, item.category)?.id;
      const dto: CreateTransactionDto = {
        userId,
        type: 'expense',
        amount,
        note: item.name || 'Giao dịch từ hóa đơn',
        transactionDate: now,
        categoryId,
      };
      await this.transactionService.create(dto);
    }
  }

  // ─── AI: Parse Expense ────────────────────────────────────────────────────────

  async parseExpense(message: string, options: CatOption[]): Promise<ChatExpenseResult> {
    try {
      const response = await this.genAI.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Hôm nay là: ${new Date().toISOString()}. Trích xuất thông tin chi tiêu từ câu sau (nếu câu không chứa thông tin về thời gian, BẮT BUỘC trả về null cho trường time): "${message}"`,
              },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'record_expense',
                  description: 'Ghi lại thông tin chi tiêu từ tin nhắn người dùng',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: {
                        type: Type.NUMBER,
                        description: 'Số tiền chi tiêu',
                        nullable: true,
                      },
                      category_name: {
                        type: Type.STRING,
                        description: 'Tên hạng mục chi tiêu',
                        enum: [...options.map((o) => o.name), 'Khác'],
                      },
                      description: {
                        type: Type.STRING,
                        description: 'Ghi chú ngắn gọn về khoản chi',
                      },
                      time: {
                        type: Type.STRING,
                        description: 'Thời gian giao dịch theo ISO 8601, null nếu không đề cập',
                        nullable: true,
                      },
                    },
                    required: ['category_name', 'description'],
                  },
                },
              ],
            },
          ],
          toolConfig: { functionCallingConfig: { mode: 'ANY' as any } },
        },
      });

      const calls = (response as any).functionCalls as any[] | undefined;
      const args = calls?.[0]?.args;
      if (!args) throw new Error('Không nhận được function call');

      return {
        amount: args.amount ?? null,
        category_name: args.category_name ?? 'Khác',
        description: args.description ?? message,
        time: args.time ?? null,
        confidence: args.amount ? 1.0 : 0.0,
      };
    } catch (error) {
      this.logger.error('Lỗi parse chi tiêu:', error);
      return { amount: null, category_name: null, description: null, time: null, confidence: 0 };
    }
  }

  // ─── AI: Financial Analysis ───────────────────────────────────────────────────

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

PHONG CÁCH: Thân thiện, chuyên nghiệp, truyền cảm hứng. Trả lời bằng tiếng Việt. Dùng emoji.

OUTPUT FORMAT (JSON DUY NHẤT):
{
  "summary": string,
  "budget_plan": [{ "group_name": string, "items": [{ "name": string, "amount": number, "description": string }] }]
}

HẠNG MỤC APP:
${list}

DỮ LIỆU:
${historyData}

YÊU CẦU: ${text}
`.trim();

    try {
      const result = await this.generateContent(prompt);
      let raw = (result.text || '').trim();
      if (raw.startsWith('```')) {
        raw = raw.replace(/```[\w]*\n?/g, '').replace(/```$/, '').trim();
      }
      return JSON5.parse(raw) as FinancialAnalysisResult;
    } catch (e) {
      this.logger.error('Parse Analysis JSON failed', e);
      return 'Tôi gặp lỗi khi chuẩn bị kế hoạch tài chính cho bạn. Hãy thử lại nhé!';
    }
  }

  // ─── AI: Chat ─────────────────────────────────────────────────────────────────

  async chatAnswer(text: string): Promise<string> {
    const result = await this.generateContent(
      `Bạn là trợ lý tài chính Money Care. Hãy trả lời thân thiện bằng tiếng Việt: ${text}`,
    );
    return (result.text || '').trim();
  }

  // ─── AI: Receipt Scan ─────────────────────────────────────────────────────────

  private getMimeType(buffer: Buffer): string {
    const signature = buffer.toString('hex', 0, 4);
    if (signature.startsWith('89504e47')) return 'image/png';
    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('52494646')) return 'image/webp';
    return 'image/jpeg';
  }

  async scanReceipt(imageBuffer: Buffer, categories?: CatOption[]): Promise<ReceiptScanResult> {
    const mimeType = this.getMimeType(imageBuffer);

    try {
      const response = await this.genAI.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: imageBuffer.toString('base64'), mimeType } },
              { text: 'Trích xuất toàn bộ thông tin từ hóa đơn trong ảnh này.' },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'extract_receipt',
                  description: 'Trích xuất thông tin từ ảnh hóa đơn',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      merchant_name: {
                        type: Type.STRING,
                        description: 'Tên thương hiệu hoặc cửa hàng',
                        nullable: true,
                      },
                      date: {
                        type: Type.STRING,
                        description: 'Ngày trên hóa đơn (ISO 8601)',
                        nullable: true,
                      },
                      total_amount: {
                        type: Type.NUMBER,
                        description: 'Tổng tiền thanh toán cuối cùng',
                        nullable: true,
                      },
                      items: {
                        type: Type.ARRAY,
                        description: 'Danh sách các mặt hàng trên hóa đơn',
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: { type: Type.STRING, description: 'Tên mặt hàng' },
                            amount: { type: Type.NUMBER, description: 'Giá tiền' },
                            category: {
                              type: Type.STRING,
                              description: 'Tên hạng mục phù hợp nhất',
                              ...(categories?.length
                                ? { enum: [...categories.map((c) => c.name), 'Khác'] }
                                : {}),
                            },
                            categoryId: {
                              type: Type.NUMBER,
                              description: 'ID hạng mục tương ứng, null nếu không khớp',
                              nullable: true,
                            },
                          },
                          required: ['name', 'amount', 'category'],
                        },
                      },
                    },
                    required: ['items'],
                  },
                },
              ],
            },
          ],
          toolConfig: { functionCallingConfig: { mode: 'ANY' as any } },
        },
      });

      const calls = (response as any).functionCalls as any[] | undefined;
      const args = calls?.[0]?.args;
      if (!args) throw new Error('Không nhận được function call');

      return {
        merchant_name: args.merchant_name ?? null,
        date: args.date ?? null,
        total_amount: args.total_amount ?? null,
        items: (args.items || []).map((i: any) => ({
          name: i.name || 'Không rõ',
          amount: Number(i.amount) || 0,
          category: i.category || 'Khác',
          categoryId: i.categoryId ?? null,
        })),
      };
    } catch (err) {
      this.logger.error('Lỗi quét hóa đơn:', err);
      return { merchant_name: null, date: null, total_amount: null, items: [] };
    }
  }

  // ─── Receipt: scan (standalone, không cần userId) ────────────────────────────

  async scanReceiptStandalone(imageBuffer: Buffer): Promise<ApiResponse<ReceiptScanResult>> {
    const data = await this.scanReceipt(imageBuffer);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data,
      message: 'Quét hóa đơn thành công',
    });
  }
}
