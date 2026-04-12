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
  ChatExpenseResult,
  FinancialAnalysisResult,
  FinancialInsightSnapshot,
  ReceiptScanResult,
} from './types/ai.types';
import { FinancialInsightsService } from './financial-insights.service';
import { CacheService } from 'src/common/cache/cache.service';
import { buildAiAnalysisCacheKey } from 'src/common/cache/financial-cache.util';

const MODEL = 'gemma-4-31b-it';
const AI_ANALYSIS_TTL_SECONDS = 300; // 5 phút

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

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenAI;

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
  }

  private async generateContent(
    prompt: string,
    image?: Buffer,
    mimeType?: string,
  ) {
    const parts: Array<{
      text?: string;
      inlineData?: { data: string; mimeType: string };
    }> = [{ text: prompt }];

    if (image && mimeType) {
      parts.push({ inlineData: { data: image.toString('base64'), mimeType } });
    }

    return this.genAI.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts }],
    });
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
  ): Category {
    const normalized = norm(name || '');
    return (
      categories.find((category) => norm(category.name) === normalized) ||
      categories.find(
        (category) =>
          norm(category.name).includes(normalized) ||
          normalized.includes(norm(category.name)),
      ) ||
      categories.find((category) => norm(category.name).includes('khac')) ||
      categories[0]
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
    const parsedExpense = await this.parseExpense(message ?? '', options);

    if (parsedExpense.confidence > 0.6 && parsedExpense.amount) {
      const amount = normalizeAmount(parsedExpense.amount);
      const pickedCategory = this.pickCategoryByName(
        categories,
        parsedExpense.category_name,
      );

      if (amount && pickedCategory) {
        const dto: CreateTransactionDto = {
          userId,
          type: 'expense',
          amount,
          note: parsedExpense.description ?? 'Chi tieu tu chatbot',
          transactionDate: parsedExpense.time || new Date().toISOString(),
          categoryId: pickedCategory.id,
        };
        await this.transactionService.create(dto);

        return {
          success: true,
          statusCode: 200,
          message: `__TRANSACTION_SAVED__${JSON.stringify({
            amount,
            category: pickedCategory.name,
            categoryIcon: pickedCategory.icon ?? 'money',
            note: parsedExpense.description ?? message ?? '',
            date: dto.transactionDate,
          })}`,
        };
      }
    }

    const answer = await this.chatAnswer(message ?? '');
    return { success: true, statusCode: 200, message: answer };
  }

  private buildIntentHash(message: string): string {
    // Normalize & hash the user's intent so similar messages share a cache key.
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
    // Resolve fundId once — reuse for both insights and cache key
    const resolvedFundId =
      fundId ??
      (await this.financialInsightsService.getSelectedFundId(userId)) ??
      0;

    // --- Check AI analysis cache first ---
    const intentHash = this.buildIntentHash(message);
    const analysisCacheKey = buildAiAnalysisCacheKey(
      userId,
      resolvedFundId,
      intentHash,
    );
    const cachedResult =
      await this.cacheService.get<string>(analysisCacheKey);
    if (cachedResult !== null) {
      this.logger.log(`[AI Cache HIT] key=${analysisCacheKey}`);
      return { success: true, statusCode: 200, message: cachedResult };
    }

    // Cache miss — fetch data and call AI
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

    // Cache the final string (not the object) so deserialization is trivial
    await this.cacheService.set(analysisCacheKey, resultString, AI_ANALYSIS_TTL_SECONDS);

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

      const categoryId =
        item.categoryId ??
        this.pickCategoryByName(categories, item.category)?.id;

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

  async parseExpense(
    message: string,
    options: CatOption[],
  ): Promise<ChatExpenseResult> {
    try {
      const response = await this.genAI.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Hom nay la: ${new Date().toISOString()}. Trich xuat thong tin chi tieu tu cau sau. Neu khong co thoi gian, bat buoc tra ve null cho truong time: "${message}"`,
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
                  description:
                    'Ghi lai thong tin chi tieu tu tin nhan nguoi dung',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      amount: {
                        type: Type.NUMBER,
                        description: 'So tien chi tieu',
                        nullable: true,
                      },
                      category_name: {
                        type: Type.STRING,
                        description: 'Ten hang muc chi tieu',
                        enum: [...options.map((option) => option.name), 'Khac'],
                      },
                      description: {
                        type: Type.STRING,
                        description: 'Ghi chu ngan gon ve khoan chi',
                      },
                      time: {
                        type: Type.STRING,
                        description:
                          'Thoi gian giao dich theo ISO 8601, null neu khong de cap',
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
      if (!args) {
        throw new Error('Khong nhan duoc function call');
      }

      return {
        amount: args.amount ?? null,
        category_name: args.category_name ?? 'Khac',
        description: args.description ?? message,
        time: args.time ?? null,
        confidence: args.amount ? 1.0 : 0.0,
      };
    } catch (error) {
      this.logger.error('Parse expense failed', error);
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
    insightData: FinancialInsightSnapshot,
    userName: string,
  ): Promise<FinancialAnalysisResult | string> {
    // Use compact JSON (no indent) to reduce token count
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
      const result = await this.generateContent(prompt);
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
    const result = await this.generateContent(
      `Ban la tro ly tai chinh Money Care. Hay tra loi than thien bang tieng Viet: ${text}`,
    );
    return (result.text || '').trim();
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
        model: MODEL,
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
