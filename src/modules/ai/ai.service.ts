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
  CategoryQuery,
  ChatTransactionResult,
  FinancialAnalysisResult,
  FinancialInsightSnapshot,
  GetTransactionQuery,
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

const MSG_PREFIX = {
  TRANSACTION_LIST: '__TRANSACTION_LIST__',
  TRANSACTION_SAVED: '__TRANSACTION_SAVED__',
  STRUCTURED_RECEIPT: '__STRUCTURED_RECEIPT__',
  STRUCTURED_ANALYSIS: '__STRUCTURED_ANALYSIS__',
  CATEGORY_LIST: '__CATEGORY_LIST__',
  CATEGORY_CREATED: '__CATEGORY_CREATED__',
};

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

  private mapToAiTransaction(t: any) {
    return {
      id: t.id,
      amount: t.amount,
      type: t.type,
      note: t.note,
      date: t.transaction_date,
      category: t.category?.name ?? 'Chưa phân loại',
      categoryIcon: t.category?.icon ?? '💰',
    };
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
    const dedupedKeys = Array.from(
      new Set([...existingKeys, analysisCacheKey]),
    );
    await this.cacheService.set(
      registryKey,
      dedupedKeys,
      Math.max(AI_ANALYSIS_REGISTRY_TTL_SECONDS, AI_ANALYSIS_TTL_SECONDS),
    );
  }

  private isLikelyTransactionMessage(
    message: string,
    categories: Category[] = [],
  ): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const hasAmount =
      /\d/.test(normalized) ||
      /\b(k|nghin|ngan|tr|trieu|cu|dong|vnd)\b/.test(normalized);

    if (!hasAmount) {
      return false;
    }

    const keywords = [
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
      'xe',
      'xang',
      'dien',
      'nuoc',
      'hoc',
      'choi',
      'gym',
      'thuoc',
      'ga',
      'sua',
      'gao',
    ];

    const matchesKeyword = keywords.some((keyword) =>
      normalized.includes(keyword),
    );
    if (matchesKeyword) return true;

    // Check if message contains any category name
    const matchesCategory = categories.some((cat) =>
      normalized.includes(norm(cat.name)),
    );
    if (matchesCategory) return true;

    // Fallback for short shorthand messages like "bún bò 40k", "rửa xe 50k"
    // Usually these are <= 6 words
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    if (words.length > 0 && words.length <= 6) {
      return true;
    }

    return false;
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

  private isGetTransactionRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const getKeywords = [
      'xem',
      'lich su',
      'danh sach',
      'bao nhieu',
      'tong cong',
      'tong chi',
      'tong thu',
      'da chi',
      'da thu',
      'giao dich',
      'chi tieu',
      'thu nhap',
      'hom nay chi',
      'hom nay thu',
      'tuan nay',
      'thang nay',
      'thang truoc',
      'gan day',
      'vua roi',
      'nhung gi',
      'nhung khoan',
      'tat ca',
      'bao gom',
      'liet ke',
    ];

    return getKeywords.some((keyword) => normalized.includes(keyword));
  }

  private async parseGetTransactionQuery(
    message: string,
  ): Promise<GetTransactionQuery> {
    try {
      const response = await this.genAI.models.generateContent({
        model: this.parseModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Ban la tro ly tai chinh thong minh.
NHIEM VU: Trich xuat thong tin truy van lich su giao dich tu tin nhan cua nguoi dung.

QUY TAC TRICH XUAT:
1. type: 
   - 'income': neu nguoi dung hoi ve thu nhap, luong, tien nhan duoc.
   - 'expense': neu hoi ve chi tieu, mua sam, tien da tra.
   - 'all': neu hoi chung chung (vd: "cho xem giao dich", "lich su gan day").
2. startDate / endDate: Dinh dang ISO 8601. Hom nay la ${new Date().toISOString()}.
   - "hom nay": bat dau tu 00:00 hom nay den hien tai.
   - "hom qua": tu 00:00 hom qua den 23:59 hom qua.
   - "tuan nay": tu thu 2 dau tuan den hien tai.
   - "thang nay": tu ngay 1 cua thang nay den hien tai.
   - "thang truoc": tu ngay 1 den ngay cuoi cung cua thang truoc.
   - "nam nay": tu ngay 1/1 den hien tai.
   - Neu khong de cap thoi gian: tra ve null cho ca hai.
3. category_name: Ten hang muc (vd: "an uong", "di lai"). Tra ve null neu khong co.
4. limit: So luong giao dich (vd: "5 giao dich", "top 10"). Tra ve null neu khong gioi han.

Tin nhan: "${message}"`,
              },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'query_transactions',
                  description: 'Truy van danh sach giao dich theo dieu kien',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      type: {
                        type: Type.STRING,
                        description: 'Loai giao dich (income/expense/all)',
                        enum: ['income', 'expense', 'all'],
                      },
                      startDate: {
                        type: Type.STRING,
                        description: 'Ngay bat dau (ISO 8601)',
                        nullable: true,
                      },
                      endDate: {
                        type: Type.STRING,
                        description: 'Ngay ket thuc (ISO 8601)',
                        nullable: true,
                      },
                      category_name: {
                        type: Type.STRING,
                        description: 'Ten hang muc muon loc',
                        nullable: true,
                      },
                      limit: {
                        type: Type.NUMBER,
                        description: 'Gioi han so luong ket qua',
                        nullable: true,
                      },
                    },
                    required: ['type'],
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
      if (!args) throw new Error('Khong nhan duoc function call');

      return {
        type: args.type ?? 'all',
        startDate: args.startDate ?? null,
        endDate: args.endDate ?? null,
        category_name: args.category_name ?? null,
        limit: args.limit ?? null,
      };
    } catch (error) {
      this.logger.error('Parse get transaction query failed', error);
      return {
        type: 'all',
        startDate: null,
        endDate: null,
        category_name: null,
        limit: null,
      };
    }
  }

  private isCategoryRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const keywords = [
      'danh muc',
      'hang muc',
      'loai chi tieu',
      'loai thu nhap',
      'them danh muc',
      'tao danh muc',
      'xem danh muc',
      'liet ke danh muc',
      'co nhung danh muc nao',
      'co nhung hang muc nao',
    ];

    return keywords.some((kw) => normalized.includes(kw));
  }

  private async parseCategoryQuery(message: string): Promise<CategoryQuery> {
    try {
      const response = await this.genAI.models.generateContent({
        model: this.parseModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Ban la tro ly tai chinh thong minh.
NHIEM VU: Trich xuat thong tin lien quan den danh muc (category) tu tin nhan cua nguoi dung.

QUY TAC TRICH XUAT:
1. action: 
   - 'add_category': neu nguoi dung muon them moi hoac tao mot danh muc.
   - 'get_categories': neu nguoi dung muon xem danh sach, liet ke cac danh muc dang co.
2. name: Ten danh muc muon them. Tra ve null neu khong phai lenh add.
3. type: 
   - 'income': neu lien quan den thu nhap.
   - 'expense': neu lien quan den chi tieu (mac dinh).
   - 'others': neu khac.
4. icon: Bieu tuong emoji phu hop (vd: 🍔 cho an uong, 🚗 cho di lai). Neu nguoi dung khong noi, hay TU DONG GOI Y icon phu hop theo ten danh muc.
5. isEssential: true neu la nhu cau thiet yeu (an, o, di chuyen), false neu la huong thu/khac. Mac dinh true.
6. percentage: null hoac con so % neu co de cap.

Hom nay la ${new Date().toISOString()}.
Tin nhan: "${message}"`,
              },
            ],
          },
        ],
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'manage_category',
                  description: 'Quan ly danh muc cua nguoi dung',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        description: 'Hanh dong (get_categories/add_category)',
                        enum: ['get_categories', 'add_category'],
                      },
                      name: {
                        type: Type.STRING,
                        description: 'Ten danh muc',
                        nullable: true,
                      },
                      type: {
                        type: Type.STRING,
                        description: 'Loai (income/expense/others)',
                        enum: ['income', 'expense', 'others'],
                      },
                      icon: {
                        type: Type.STRING,
                        description: 'Emoji dai dien',
                        nullable: true,
                      },
                      isEssential: {
                        type: Type.BOOLEAN,
                        description: 'Co phai thiet yeu khong',
                        nullable: true,
                      },
                      percentage: {
                        type: Type.NUMBER,
                        description: 'Phan tram ngan sach',
                        nullable: true,
                      },
                    },
                    required: ['action'],
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
      if (!args) throw new Error('Khong nhan duoc function call');

      return {
        action: args.action,
        name: args.name ?? null,
        type: args.type ?? 'expense',
        icon: args.icon ?? null,
        isEssential: args.isEssential ?? true,
        percentage: args.percentage ?? null,
      };
    } catch (error) {
      this.logger.error('Parse category query failed', error);
      return {
        action: 'get_categories',
        name: null,
        type: 'expense',
        icon: null,
        isEssential: true,
        percentage: null,
      };
    }
  }

  private async handleCategoryRequest(
    message: string,
    userId: number,
    fundId?: number,
  ): Promise<ApiResponse<string>> {
    const query = await this.parseCategoryQuery(message);

    if (query.action === 'get_categories') {
      const categories = await this.getCategories(userId, fundId);
      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.CATEGORY_LIST}${JSON.stringify({
          action: 'get_categories',
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            type: c.type,
            isEssential: c.isEssential,
          })),
        })}`,
      };
    }

    if (query.action === 'add_category') {
      if (!query.name) {
        return {
          success: true,
          statusCode: 200,
          message: 'Vui lòng cung cấp tên danh mục bạn muốn thêm.',
        };
      }

      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user) throw new BadRequestException('User not found');

      let fund: Fund | null = null;
      if (fundId && fundId > 0) {
        fund = await this.fundRepo.findOne({ where: { id: fundId } });
      }

      const newCat = this.categoryRepo.create({
        name: query.name,
        icon: query.icon ?? '📁',
        type: query.type as any,
        isEssential: query.isEssential ?? true,
        percentage: query.percentage ?? 0,
        user,
        fund,
      });

      const saved = await this.categoryRepo.save(newCat);

      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.CATEGORY_CREATED}${JSON.stringify({
          action: 'add_category',
          category: {
            id: saved.id,
            name: saved.name,
            icon: saved.icon,
            type: saved.type,
          },
        })}`,
      };
    }

    return {
      success: true,
      statusCode: 200,
      message: 'Tôi chưa hiểu yêu cầu về danh mục của bạn.',
    };
  }

  private async handleGetTransactions(
    message: string,
    userId: number,
    fundId?: number,
  ): Promise<ApiResponse<string>> {
    const query = await this.parseGetTransactionQuery(message);

    const filter: any = {
      userId,
      fundId,
      startDate: query.startDate ?? undefined,
      endDate: query.endDate ?? undefined,
      categoryName: query.category_name ?? undefined,
      limit: query.limit ?? undefined,
    };

    const result = await this.transactionService.findAllByFilter(filter);
    const { income, expense } = result.data ?? { income: [], expense: [] };

    let transactions: any[] = [];
    if (query.type === 'income') {
      transactions = income;
    } else if (query.type === 'expense') {
      transactions = expense;
    } else {
      // Merge and sort if 'all'
      transactions = [
        ...income.map((t) => ({ ...t, type: 'income' })),
        ...expense.map((t) => ({ ...t, type: 'expense' })),
      ].sort(
        (a, b) =>
          new Date(b.transaction_date).getTime() -
          new Date(a.transaction_date).getTime(),
      );

      // If 'all' and has limit, we need to re-limit after merging
      if (query.limit && query.limit > 0) {
        transactions = transactions.slice(0, query.limit);
      }
    }

    return {
      success: true,
      statusCode: 200,
      message: `${MSG_PREFIX.TRANSACTION_LIST}${JSON.stringify({
        query,
        transactions: transactions.map((t) => this.mapToAiTransaction(t)),
        total: transactions.length,
      })}`,
    };
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
        message: `${MSG_PREFIX.STRUCTURED_RECEIPT}${JSON.stringify(scanResult)}`,
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

    if (this.isCategoryRequest(message ?? '')) {
      return this.handleCategoryRequest(message ?? '', userId, fundId);
    }

    if (this.isGetTransactionRequest(message ?? '')) {
      return this.handleGetTransactions(message ?? '', userId, fundId);
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
    if (!this.isLikelyTransactionMessage(message ?? '', categories)) {
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
          message: `${MSG_PREFIX.TRANSACTION_SAVED}${JSON.stringify({
            ...this.mapToAiTransaction({
              ...dto,
              id: undefined,
              category: {
                name: pickedCategory?.name,
                icon: pickedCategory?.icon,
              },
            }),
            note: dto.note, // Override if needed
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
        ? `${MSG_PREFIX.STRUCTURED_ANALYSIS}${JSON.stringify(analysis)}`
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
      `Ban la tro ly tai chinh thong minh cua ung dung Money Care.
NHIEM VU: Ho tro nguoi dung ve cac chuyen de tai chinh, chi tieu, tiet kiem va cach su dung cac tinh nang cua app Money Care.
QUY TAC:
1. Neu nguoi dung hoi ve nhieu chuyen de khong lien quan den tai chinh (vi du: the thao, bong da, giai tri, thoi tiet, kien thuc tong hop khong lien quan...), hay lich su tu choi va giai thich rang ban la tro ly tai chinh cua Money Care nen chi tap trung vao ho tro quan ly tien bac.
2. Tra loi ngan gon, than thien bang tieng Viet.
3. Luon huong nguoi dung vao viec quan ly tai chinh tot hon.

Cau hoi: "${text}"`,
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

  async getFinancialInsights(
    userId: number,
    fundId?: number,
    period?: 'this_month' | 'last_30_days',
  ) {
    const data = await this.financialInsightsService.getInsights(
      userId,
      fundId,
      period,
    );
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data,
    });
  }
}
