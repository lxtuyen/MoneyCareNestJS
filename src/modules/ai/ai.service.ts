import {
  BadRequestException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import JSON5 from 'json5';
import { createHash } from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Fund, FundType } from 'src/modules/saving-funds/entities/fund.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import {
  CatOption,
  ChatTransactionResult,
  FinancialAnalysisResult,
  FinancialInsightSnapshot,
  ReceiptScanResult,
} from './types/ai.types';
import { FinancialInsightsService } from './financial-insights.service';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildAiAnalysisCacheKey,
  buildAiAnalysisRegistryKey,
} from 'src/common/cache/financial-cache.util';

//const DEFAULT_MODEL = 'gemma-4-26b-a4b-it';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const AI_ANALYSIS_TTL_SECONDS = 300;
const AI_ANALYSIS_REGISTRY_TTL_SECONDS = 300;
const CHAT_TTL_SECONDS = 60;

function normalizeAmount(amount: number | null): number | null {
  if (!amount || amount <= 0) return null;
  if (amount < 1000) return amount * 1000;
  return Math.round(amount);
}

function norm(value: string) {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d.getTime());
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenAI;
  private readonly chatModel: string;
  private readonly parseModel: string;
  private readonly analysisModel: string;
  private readonly receiptModel: string;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly financialInsightsService: FinancialInsightsService,
    private readonly cacheService: CacheService,
    @InjectRepository(Fund)
    private readonly fundRepo: Repository<Fund>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY in environment variables');
    }
    this.genAI = new GoogleGenAI({ apiKey });
    this.chatModel = process.env.GEMINI_CHAT_MODEL || DEFAULT_MODEL;
    this.parseModel = process.env.GEMINI_PARSE_MODEL || this.chatModel;
    this.analysisModel = process.env.GEMINI_ANALYSIS_MODEL || this.chatModel;
    this.receiptModel = process.env.GEMINI_RECEIPT_MODEL || this.parseModel;
  }

  private async generateContent(
    prompt: string,
    image?: Buffer,
    mimeType?: string,
    model = this.chatModel,
  ) {
    const parts: Array<{
      text?: string;
      inlineData?: { data: string; mimeType: string };
    }> = [{ text: prompt }];

    if (image && mimeType) {
      parts.push({ inlineData: { data: image.toString('base64'), mimeType } });
    }

    return this.genAI.models.generateContent({
      model,
      contents: [{ role: 'user', parts }],
    });
  }

  private buildChatCacheKey(message: string): string {
    return `v1:ai_chat:${this.buildIntentHash(message)}`;
  }

  private async registerAnalysisCacheKey(
    userId: number,
    fundId: number,
    analysisCacheKey: string,
  ): Promise<void> {
    const registryKey = buildAiAnalysisRegistryKey(userId, fundId);
    const existingKeys =
      (await this.cacheService.get<string[]>(registryKey)) ?? [];
    const dedupedKeys = Array.from(new Set([...existingKeys, analysisCacheKey]));
    await this.cacheService.set(
      registryKey,
      dedupedKeys,
      Math.max(AI_ANALYSIS_REGISTRY_TTL_SECONDS, AI_ANALYSIS_TTL_SECONDS),
    );
  }

  private isLikelyTransactionMessage(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const hasAmount =
      /\d/.test(normalized) ||
      /\b(k|nghin|ngan|tr|trieu|cu|dong|vnd)\b/.test(normalized);

    if (!hasAmount) {
      return false;
    }

    return [
      'chi',
      'mua',
      'tra',
      'an',
      'uong',
      'nap',
      'dong tien',
      'luong',
      'thu',
      'nhan',
      'ban duoc',
      'kiem duoc',
      'mat',
      'ton',
      'hoa don',
      'giao dich',
    ].some((keyword) => normalized.includes(keyword));
  }

  private async getSelectedFund(userId: number): Promise<Fund | null> {
    const selected = await this.fundRepo.findOne({
      where: { user: { id: userId }, is_selected: true },
      order: { updated_at: 'DESC' },
    });
    if (selected) return selected;

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

  private async getCategories(
    userId: number,
    fundId?: number,
  ): Promise<Category[]> {
    if (fundId && fundId > 0) {
      const fundCategories = await this.getCategoriesByFundId(fundId);
      if (fundCategories.length > 0) return fundCategories;
    }

    const selectedFund = await this.getSelectedFund(userId);
    if (selectedFund) {
      const fundCategories = await this.getCategoriesByFundId(selectedFund.id);
      if (fundCategories.length > 0) return fundCategories;
    }

    return this.getCategoriesByUserId(userId);
  }

  private pickCategoryByName(
    categories: Category[],
    name: string | null,
    type: 'income' | 'expense',
  ): Category | undefined {
    const typeCategories = categories.filter(
      (c) => c.type === type || c.type === ('others' as any),
    );

    if (name) {
      const normalized = norm(name);
      const match =
        typeCategories.find((category) => norm(category.name) === normalized) ||
        typeCategories.find(
          (category) =>
            norm(category.name).includes(normalized) ||
            normalized.includes(norm(category.name)),
        );
      if (match) return match;
    }

    return typeCategories.find(
      (category) =>
        norm(category.name).includes('khac') ||
        norm(category.name).includes('chua phan loai'),
    );
  }

  private async getFallbackCategoryFromDB(
    userId: number,
    type: 'income' | 'expense',
  ): Promise<Category | null> {
    const allCategories = await this.categoryRepo.find({
      where: [
        { user: { id: userId }, type: type as any },
        { user: { id: userId }, type: 'others' as any },
      ],
    });
    return (
      allCategories.find(
        (c) =>
          norm(c.name).includes('khac') ||
          norm(c.name).includes('chua phan loai'),
      ) || null
    );
  }

  async handle(
    message: string | undefined,
    userIdRaw: unknown,
    file?: Express.Multer.File,
    fundId?: number,
  ): Promise<ApiResponse<string>> {
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId must be a number');
    }

    if (file) {
      const categories = await this.getCategories(userId, fundId);
      const categoryOptions: CatOption[] = categories.map((category) => ({
        id: category.id,
        name: category.name,
      }));
      const scanResult = await this.scanReceipt(file.buffer, categoryOptions);

      return {
        success: true,
        statusCode: 200,
        message: `__STRUCTURED_RECEIPT__${JSON.stringify(scanResult)}`,
      };
    }

    const lowerMessage = norm(message || '');
    const isAnalysisRequest =
      lowerMessage.includes('phan tich') ||
      lowerMessage.includes('ke hoach') ||
      lowerMessage.includes('ngan sach') ||
      lowerMessage.includes('khuyen');

    if (isAnalysisRequest) {
      return this.handleAnalysis(message ?? '', userId, fundId);
    }

    const categories = await this.getCategories(userId, fundId);
    if (categories.length === 0) {
      const answer = await this.chatAnswer(message ?? '');
      return { success: true, statusCode: 200, message: answer };
    }

    const options: CatOption[] = categories.map((category) => ({
      id: category.id,
      name: category.name,
    }));
    if (!this.isLikelyTransactionMessage(message ?? '')) {
      const answer = await this.chatAnswer(message ?? '');
      return { success: true, statusCode: 200, message: answer };
    }

    const parsedTrans = await this.parseTransaction(message ?? '', options);

    if (parsedTrans.amount) {
      const amount = normalizeAmount(parsedTrans.amount);
      let pickedCategory = this.pickCategoryByName(
        categories,
        parsedTrans.category_name,
        parsedTrans.type as 'income' | 'expense',
      );

      if (!pickedCategory) {
        const fallback = await this.getFallbackCategoryFromDB(
          userId,
          parsedTrans.type as 'income' | 'expense',
        );
        if (fallback) pickedCategory = fallback;
      }

      if (amount) {
        this.logger.log(
          `[Chatbot Transaction] Saving ${parsedTrans.type}: amount=${amount}, category=${pickedCategory?.name || 'None'}, time=${parsedTrans.time}`,
        );

        const dto: CreateTransactionDto = {
          userId,
          type: parsedTrans.type as 'income' | 'expense',
          amount,
          note: parsedTrans.description ?? 'Giao dich tu chatbot',
          transactionDate: isValidDate(parsedTrans.time)
            ? new Date(parsedTrans.time!).toISOString()
            : new Date().toISOString(),
          categoryId: pickedCategory?.id,
        };
        await this.transactionService.create(dto);

        return {
          success: true,
          statusCode: 200,
          message: `__TRANSACTION_SAVED__${JSON.stringify({
            amount,
            type: parsedTrans.type,
            category: pickedCategory?.name || 'Chưa phân loại',
            categoryIcon: pickedCategory?.icon ?? '💰',
            note: parsedTrans.description ?? message ?? '',
            date: dto.transactionDate,
          })}`,
        };
      }
    }

    const answer = await this.chatAnswer(message ?? '');
    return { success: true, statusCode: 200, message: answer };
  }

  private buildIntentHash(message: string): string {
    const normalized = (message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
    return createHash('md5').update(normalized).digest('hex').slice(0, 8);
  }

  private async handleAnalysis(
    message: string,
    userId: number,
    fundId?: number,
  ): Promise<ApiResponse<string>> {
    const resolvedFundId =
      fundId ??
      (await this.financialInsightsService.getSelectedFundId(userId)) ??
      0;

    const intentHash = this.buildIntentHash(message);
    const analysisCacheKey = buildAiAnalysisCacheKey(
      userId,
      resolvedFundId,
      intentHash,
    );
    const cachedResult = await this.cacheService.get<string>(analysisCacheKey);
    if (cachedResult !== null) {
      this.logger.log(`[AI Cache HIT] key=${analysisCacheKey}`);
      return { success: true, statusCode: 200, message: cachedResult };
    }

    const [user, insights] = await Promise.all([
      this.userRepo.findOne({
        where: { id: userId },
        relations: ['profile'],
      }),
      this.financialInsightsService.getInsights(
        userId,
        resolvedFundId || undefined,
        'last_30_days',
      ),
    ]);

    const userName = user?.profile
      ? `${user.profile.first_name || ''} ${user.profile.last_name || ''}`.trim()
      : 'Nguoi dung';

    const analysis = await this.analyzeFinancialHealth(
      message,
      insights,
      userName || 'Nguoi dung',
    );

    const resultString =
      typeof analysis === 'object'
        ? `__STRUCTURED_ANALYSIS__${JSON.stringify(analysis)}`
        : analysis;

    await this.cacheService.set(
      analysisCacheKey,
      resultString,
      AI_ANALYSIS_TTL_SECONDS,
    );
    await this.registerAnalysisCacheKey(
      userId,
      resolvedFundId,
      analysisCacheKey,
    );

    return { success: true, statusCode: 200, message: resultString };
  }

  async bulkCreateTransactions(
    userId: number,
    items: any[],
    fundId?: number,
  ): Promise<void> {
    const categories = await this.getCategories(userId, fundId);
    if (!categories.length) {
      throw new BadRequestException('Nguoi dung chua co hang muc chi tieu');
    }

    const now = new Date().toISOString();
    for (const item of items) {
      const amount = normalizeAmount(item.amount);
      if (!amount || amount <= 0) continue;

      let categoryId = item.categoryId;
      if (!categoryId) {
        const picked = this.pickCategoryByName(
          categories,
          item.category,
          'expense',
        );
        if (picked) {
          categoryId = picked.id;
        } else {
          const fallback = await this.getFallbackCategoryFromDB(
            userId,
            'expense',
          );
          categoryId = fallback?.id;
        }
      }

      await this.transactionService.create({
        userId,
        type: 'expense',
        amount,
        note: item.name || 'Giao dich tu hoa don',
        transactionDate: now,
        categoryId,
      });
    }
  }

  async parseTransaction(
    message: string,
    options: CatOption[],
  ): Promise<ChatTransactionResult> {
    try {
      const response = await this.genAI.models.generateContent({
        model: this.parseModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Ban la mot may trich xuat du lieu tai chinh. 
NHIEM VU: Bat buoc dung cong cu 'record_transaction' de ghi lai moi thong tin thu nhap hoac chi tieu trong tin nhan.
QUY TAC:
1. KHONG duoc tra loi bang van ban thong thuong. Chi duoc goi function call.
2. Bat buoc lay CHINH XAC so tien, khong tu y tinh toan.
3. Loai giao dich (type) phai chinh xac: 'income' cho thu nhap/luong, 'expense' cho chi tiêu.
4. Neu khong co thoi gian, tra ve null cho time.
5. Ghi chú (description) phải ngắn gọn, tập trung vào nội dung chính (Ví dụ: "Ăn sáng", "Tiền phòng tháng 10"). TUYỆT ĐỐI KHÔNG lặp lại số tiền trong phần ghi chú này.
6. Ghi chú KHÔNG bao gồm các từ mô tả thời gian mang tính tương đối (như "hôm nay", "sáng nay", "vừa xong") vì thời gian đã được lưu riêng.
7. category_name: CHỈ BẮT BUỘC chọn từ danh sách. Nếu KHÔNG CÓ hạng mục nào thực sự khớp 100% với mục đích chi tiêu, phải chọn "Khac" (tuyệt đối không gượng ép gán vào các hạng mục không liên quan như "Mua sắm" khi đi ăn).

Hom nay la: ${new Date().toISOString()}. 
Tin nhan nguoi dung: "${message}"`,
              },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'record_transaction',
                  description:
                    'Ghi lai thong tin chi tieu hoac thu nhap tu tin nhan nguoi dung',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: {
                        type: Type.NUMBER,
                        description: 'So tien giao dich',
                        nullable: true,
                      },
                      type: {
                        type: Type.STRING,
                        description: 'Loai giao dich (thu nhap hay chi tieu)',
                        enum: ['income', 'expense'],
                      },
                      category_name: {
                        type: Type.STRING,
                        description: 'Ten hang muc giao dich',
                        enum: [...options.map((option) => option.name), 'Khac'],
                      },
                      description: {
                        type: Type.STRING,
                        description:
                          'Ghi chú ngắn gọn về nội dung giao dịch (Ví dụ: "Ăn trưa", "Lương tháng 4"). TUYỆT ĐỐI KHÔNG bao gồm số tiền trong ghi chú này.',
                      },
                      time: {
                        type: Type.STRING,
                        description:
                          'Thoi gian giao dich theo ISO 8601, null neu khong de cap',
                        nullable: true,
                      },
                    },
                    required: ['type', 'category_name', 'description'],
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
      if (!args) {
        throw new Error('Khong nhan duoc function call');
      }

      return {
        amount: args.amount ?? null,
        type: args.type ?? 'expense',
        category_name: args.category_name ?? 'Khac',
        description: args.description ?? message,
        time: args.time ?? null,
        confidence: args.amount ? 1.0 : 0.0,
      };
    } catch (error) {
      this.logger.error('Parse transaction failed', error);
      return {
        amount: null,
        type: 'expense',
        category_name: null,
        description: null,
        time: null,
        confidence: 0,
      };
    }
  }

  async analyzeFinancialHealth(
    text: string,
    insightData: FinancialInsightSnapshot,
    userName: string,
  ): Promise<FinancialAnalysisResult | string> {
    const prompt = `
Ban la chuyen gia tai chinh ca nhan cho ung dung "Money Care".
Ten nguoi dung: ${userName}.

NHIEM VU: Dua tren JSON insight, hay:
1. Nhan xet tinh hinh chi tieu gan day.
2. Canh bao hang muc tang nhanh hoac gay rui ro.
3. Dua ra 3 loi khuyen cu the de tiet kiem.
4. Goi y ke hoach ngan sach thang toi.

QUY TAC: Chi dung so lieu trong JSON. Khong bịa them giao dich hay danh muc.

OUTPUT (JSON DUY NHAT):
{"summary":string,"budget_plan":[{"group_name":string,"items":[{"name":string,"amount":number,"description":string}]}]}

INSIGHT:${JSON.stringify(insightData)}
YEU CAU:${text}
`.trim();

    try {
      const result = await this.generateContent(
        prompt,
        undefined,
        undefined,
        this.analysisModel,
      );
      let raw = (result.text || '').trim();
      if (raw.startsWith('```')) {
        raw = raw
          .replace(/```[\w]*\n?/g, '')
          .replace(/```$/, '')
          .trim();
      }
      return JSON5.parse(raw) as FinancialAnalysisResult;
    } catch (error) {
      this.logger.error('Parse analysis JSON failed', error);
      return 'Toi gap loi khi chuan bi ke hoach tai chinh cho ban. Hay thu lai.';
    }
  }

  async chatAnswer(text: string): Promise<string> {
    const cacheKey = this.buildChatCacheKey(text);
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const result = await this.generateContent(
      `Ban la tro ly tai chinh Money Care. Hay tra loi than thien bang tieng Viet: ${text}`,
      undefined,
      undefined,
      this.chatModel,
    );
    const answer = (result.text || '').trim();
    await this.cacheService.set(cacheKey, answer, CHAT_TTL_SECONDS);
    return answer;
  }

  private getMimeType(buffer: Buffer): string {
    const signature = buffer.toString('hex', 0, 4);
    if (signature.startsWith('89504e47')) return 'image/png';
    if (signature.startsWith('ffd8ff')) return 'image/jpeg';
    if (signature.startsWith('52494646')) return 'image/webp';
    return 'image/jpeg';
  }

  async scanReceipt(
    imageBuffer: Buffer,
    categories?: CatOption[],
  ): Promise<ReceiptScanResult> {
    const mimeType = this.getMimeType(imageBuffer);

    try {
      const response = await this.genAI.models.generateContent({
        model: this.receiptModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: { data: imageBuffer.toString('base64'), mimeType },
              },
              {
                text: 'Trich xuat toan bo thong tin tu hoa don trong anh nay.',
              },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'extract_receipt',
                  description: 'Trich xuat thong tin tu anh hoa don',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      merchant_name: {
                        type: Type.STRING,
                        description: 'Ten thuong hieu hoac cua hang',
                        nullable: true,
                      },
                      date: {
                        type: Type.STRING,
                        description: 'Ngay tren hoa don theo ISO 8601',
                        nullable: true,
                      },
                      total_amount: {
                        type: Type.NUMBER,
                        description: 'Tong tien thanh toan cuoi cung',
                        nullable: true,
                      },
                      items: {
                        type: Type.ARRAY,
                        description: 'Danh sach cac mat hang tren hoa don',
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            name: {
                              type: Type.STRING,
                              description: 'Ten mat hang',
                            },
                            amount: {
                              type: Type.NUMBER,
                              description: 'Gia tien',
                            },
                            category: {
                              type: Type.STRING,
                              description: 'Ten hang muc phu hop nhat',
                              ...(categories?.length
                                ? {
                                    enum: [
                                      ...categories.map((item) => item.name),
                                      'Khac',
                                    ],
                                  }
                                : {}),
                            },
                            categoryId: {
                              type: Type.NUMBER,
                              description:
                                'ID hang muc tuong ung, null neu khong khop',
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
      if (!args) {
        throw new Error('Khong nhan duoc function call');
      }

      return {
        merchant_name: args.merchant_name ?? null,
        date: args.date ?? null,
        total_amount: args.total_amount ?? null,
        items: (args.items || []).map((item: any) => ({
          name: item.name || 'Khong ro',
          amount: Number(item.amount) || 0,
          category: item.category || 'Khac',
          categoryId: item.categoryId ?? null,
        })),
      };
    } catch (error) {
      this.logger.error('Receipt scan failed', error);
      return { merchant_name: null, date: null, total_amount: null, items: [] };
    }
  }

  async scanReceiptStandalone(
    imageBuffer: Buffer,
  ): Promise<ApiResponse<ReceiptScanResult>> {
    const data = await this.scanReceipt(imageBuffer);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data,
      message: 'Quet hoa don thanh cong',
    });
  }
}
