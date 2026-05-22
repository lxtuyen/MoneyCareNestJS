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
import { GoogleGenAI, Type, FunctionCallingConfigMode } from '@google/genai';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import {
  CatOption,
  ChatTransactionResult,
  FinancialAnalysisResult,
  GoalPlanInsightResult,
  FinancialInsightSnapshot,
  GetTransactionQuery,
} from './types/ai.types';
import { FinancialInsightsService } from './financial-insights.service';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildAiAnalysisCacheKey,
  buildAiAnalysisRegistryKey,
} from 'src/common/cache/financial-cache.util';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoalsService } from 'src/modules/saving-goals/saving-goals.service';
import { SavingGoalsStatisticsService } from 'src/modules/saving-goals/saving-goals-statistics.service';
import { WalletsService } from 'src/modules/wallets/wallets.service';
import {
  GoalPlanInsightDto,
  GoalPlanInsightResponseDto,
  GoalPlanProgressStatus,
} from './dto/goal-plan-insight.dto';
import {
  ReceiptOcrLine,
  ReceiptRuleCandidate,
  ScanReceiptModel,
  ScanReceiptResponse,
} from './types/receipt.types';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const AI_ANALYSIS_TTL_SECONDS = 300;
const AI_ANALYSIS_REGISTRY_TTL_SECONDS = 300;
const CHAT_TTL_SECONDS = 60;

const MSG_PREFIX = {
  TRANSACTION_LIST: '__TRANSACTION_LIST__',
  TRANSACTION_SAVED: '__TRANSACTION_SAVED__',
  STRUCTURED_ANALYSIS: '__STRUCTURED_ANALYSIS__',
  SAVING_GOAL_CREATED: '__SAVING_GOAL_CREATED__',
  SAVING_GOAL_PROPOSAL: '__SAVING_GOAL_PROPOSAL__',
  SAVING_GOAL_INITIAL_FUND_ASK: '__SAVING_GOAL_INITIAL_FUND_ASK__',
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

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmed = value.trim();
  const direct = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (direct) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    if (
      date.getUTCFullYear() === Number(direct[1]) &&
      date.getUTCMonth() + 1 === Number(direct[2]) &&
      date.getUTCDate() === Number(direct[3])
    ) {
      return trimmed;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const vnDate = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(trimmed);
  if (!vnDate) return null;

  const day = vnDate[1].padStart(2, '0');
  const month = vnDate[2].padStart(2, '0');
  const year =
    vnDate[3].length === 2 ? `20${vnDate[3]}` : vnDate[3].padStart(4, '0');
  return normalizeIsoDate(`${year}-${month}-${day}`);
}

function coerceString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coerceAmount(value: unknown): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/[^\d.-]/g, ''))
        : 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric);
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly genAI: GoogleGenAI;
  private readonly chatModel: string;
  private readonly parseModel: string;
  private readonly analysisModel: string;

  constructor(
    private readonly transactionService: TransactionService,
    private readonly financialInsightsService: FinancialInsightsService,
    private readonly cacheService: CacheService,
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly spendingPlansService: SpendingPlansService,
    private readonly savingGoalsService: SavingGoalsService,
    private readonly savingGoalsStatisticsService: SavingGoalsStatisticsService,
    private readonly walletsService: WalletsService,
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing GEMINI_API_KEY in environment variables');
    }
    this.genAI = new GoogleGenAI({ apiKey });
    this.chatModel = process.env.GEMINI_CHAT_MODEL || DEFAULT_MODEL;
    this.parseModel = process.env.GEMINI_PARSE_MODEL || this.chatModel;
    this.analysisModel = process.env.GEMINI_ANALYSIS_MODEL || this.chatModel;
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
      subCategory: t.subCategory?.name ?? null,
      subCategoryIcon: t.subCategory?.icon ?? null,
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

  private safeJsonParse<T>(value: unknown, fallback: T): T {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    try {
      return JSON5.parse(value);
    } catch {
      return fallback;
    }
  }

  private stripJsonFence(value: string): string {
    let raw = value.trim();
    if (raw.startsWith('```')) {
      raw = raw
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/, '')
        .trim();
    }
    return raw;
  }

  private parseReceiptLines(value: unknown): ReceiptOcrLine[] {
    const parsed = this.safeJsonParse<unknown>(value, []);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map<ReceiptOcrLine | null>((item) => {
        if (!item || typeof item !== 'object') return null;
        const line = item as Record<string, unknown>;
        const text = coerceString(line.text);
        if (!text) return null;
        const parsedLine: ReceiptOcrLine = {
          text,
          x: Number.isFinite(Number(line.x)) ? Number(line.x) : undefined,
          y: Number.isFinite(Number(line.y)) ? Number(line.y) : undefined,
          w: Number.isFinite(Number(line.w)) ? Number(line.w) : undefined,
          h: Number.isFinite(Number(line.h)) ? Number(line.h) : undefined,
        };
        return parsedLine;
      })
      .filter((line): line is ReceiptOcrLine => line !== null);
  }

  private parseRuleCandidate(value: unknown): ReceiptRuleCandidate {
    const parsed = this.safeJsonParse<unknown>(value, {});
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const raw = parsed as Record<string, unknown>;
    const warnings = Array.isArray(raw.warnings)
      ? raw.warnings
          .map((warning) => coerceString(warning))
          .filter((warning) => warning.length > 0)
      : undefined;

    return {
      merchantName: coerceString(raw.merchantName),
      transactionDate: coerceString(raw.transactionDate),
      totalAmount: coerceAmount(raw.totalAmount),
      currency: coerceString(raw.currency),
      confidence: Number.isFinite(Number(raw.confidence))
        ? Number(raw.confidence)
        : 0,
      warnings,
    };
  }

  private extractJsonObject(rawText: string): Record<string, unknown> {
    let raw = (rawText || '').trim();
    if (raw.startsWith('```')) {
      raw = raw
        .replace(/```[\w]*\n?/g, '')
        .replace(/```$/, '')
        .trim();
    }

    try {
      const parsed = JSON5.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start < 0 || end <= start) return {};
      try {
        const parsed = JSON5.parse(raw.slice(start, end + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      } catch {
        return {};
      }
    }
  }

  private validateReceiptResult(
    raw: Record<string, unknown>,
    rawText: string,
    ruleCandidate: ReceiptRuleCandidate,
  ): ScanReceiptModel {
    const fallbackDate =
      normalizeIsoDate(ruleCandidate.transactionDate) ?? todayIsoDate();
    const date = normalizeIsoDate(raw.date) ?? fallbackDate;
    const parsedAmount = coerceAmount(raw.totalAmount);
    const ruleAmount = coerceAmount(ruleCandidate.totalAmount);

    return {
      rawText: rawText || coerceString(raw.rawText),
      merchantName: coerceString(raw.merchantName),
      address: coerceString(raw.address),
      date,
      totalAmount: parsedAmount > 0 ? parsedAmount : ruleAmount,
      currency: coerceString(raw.currency) || ruleCandidate.currency || 'VND',
      categoryKey: coerceString(raw.categoryKey),
      categoryName: coerceString(raw.categoryName),
    };
  }

  private toScanReceiptResponse(result: ScanReceiptModel): ScanReceiptResponse {
    return {
      raw_text: result.rawText,
      merchant_name: result.merchantName,
      address: result.address,
      date: result.date,
      total_amount: result.totalAmount,
      currency: result.currency,
      category_key: result.categoryKey,
      category_name: result.categoryName,
      suggested_note: result.suggestedNote,
    };
  }

  private buildReceiptPrompt(
    rawText: string,
    ocrLines: ReceiptOcrLine[],
    ruleCandidate: ReceiptRuleCandidate,
    hasExternalOcr: boolean,
    categories: Category[],
  ): string {
    const ocrLinesBlock = ocrLines.length ? JSON.stringify(ocrLines) : '[]';
    const ruleBlock = JSON.stringify(ruleCandidate);
    const categoryNames = categories.map((c) => c.name).join(', ');

    return `
 Ban la parser hoa don tieng Viet cho ung dung Money Care.
 Ban la mot chuyen gia ve trich xuat du lieu tu anh/text hoa don.
 
 NHIEM VU: Trich xuat thong tin hoa don va chi tra ve JSON hop le, dung schema.
 
 SCHEMA BAT BUOC:
 {
   "rawText": string,
   "merchantName": string,
   "address": string,
   "date": "YYYY-MM-DD",
   "totalAmount": integer,
   "currency": "VND",
   "categoryKey": string,
   "categoryName": string,
   "suggestedNote": string
 }
 
 NGUON DU LIEU:
 - Co OCR text/lines tu frontend: ${hasExternalOcr ? 'co' : 'khong'}.
 - rawText OCR:
 ${rawText || '(khong co raw text)'}
 - ocrLines JSON:
 ${ocrLinesBlock}
 - ruleCandidate JSON:
 ${ruleBlock}
 
 QUY TAC PHAN LOAI:
 - He thong su dung bo danh muc CO DINH.
 - Ban CHI DUOC PHEP chon categoryName phu hop nhat tu danh sach nay: [${categoryNames}].
 - TUYET DOI KHONG tu y tao ra ten danh muc moi hoac thay doi ten trong danh sach.
 - Neu khong tim thay ten cua hang, hay nhin vao danh sach cac mon hang (items) de phan loai.
 - Vi du: Neu co "Oc huong", "Cua hap", "Budweiser", "Hau nuong" -> CHAC CHAN la "An uong".
 - Neu la sieu thi, cho, thuc pham tuoi song -> Chon "Di cho" hoac "Mua sam".
 - Neu khong co cai nao hop le, hay tra ve "Khac".
 - Luu y: Neu day khong phai la hoa don (vd: trang sach, van ban khong lien quan), hay tra ve JSON voi totalAmount: 0.
 
 QUY TAC TRICH XUAT:
 1. Khong duoc tu bia du lieu. 
 2. totalAmount phai la so nguyen duong. Neu thay nhieu con so, hay tim "Tong cong", "Thanh tien", "Total", "Tong thanh toan".
 3. Neu khong co ten cua hang ro rang, hay de merchantName la "Cua hang" hoac ten mon do dau tien.
 4. currency mac dinh la "VND".
 5. date phai la YYYY-MM-DD. Neu khong co nam, hay lay nam hien tai (2024).
 6. suggestedNote: Tao mot ghi chu ngan gon, tu nhien. Neu co ten mon an thi ghi "An [ten mon dau tien]...", neu khong thi ghi "Mua sam tai [ten cua hang]".
 7. Chi tra ve mot JSON object duy nhat, khong co text giai thich, khong markdown.
 `.trim();
  }

  async scanReceipt(
    body: Record<string, string | undefined>,
    categories: Category[] = [],
  ): Promise<ApiResponse<ScanReceiptResponse>> {
    const ocrText = coerceString(body?.ocrText);
    const ocrLines = this.parseReceiptLines(body?.ocrLines);
    const ruleCandidate = this.parseRuleCandidate(body?.ruleCandidate);
    const hasExternalOcr = Boolean(ocrText || ocrLines.length);

    const rawText = ocrText || ocrLines.map((line) => line.text).join('\n');

    let activeCategories = categories;
    const userId = Number(body?.userId);
    if (activeCategories.length === 0 && !isNaN(userId)) {
      activeCategories = await this.getCategories(userId);
    }

    const prompt = this.buildReceiptPrompt(
      rawText,
      ocrLines,
      ruleCandidate,
      hasExternalOcr,
      activeCategories,
    );

    try {
      const result = await this.generateContent(prompt);
      const parsed = this.extractJsonObject(result.text || '');
      const data = this.toScanReceiptResponse(
        this.validateReceiptResult(parsed, rawText, ruleCandidate),
      );

      return {
        success: true,
        statusCode: HttpStatus.OK,
        data,
        message: 'Scan receipt successfully',
      };
    } catch (error) {
      this.logger.error('Scan receipt failed', error);
      const data = this.toScanReceiptResponse(
        this.validateReceiptResult({}, rawText, ruleCandidate),
      );
      return {
        success: true,
        statusCode: HttpStatus.OK,
        data,
        message: 'Scan receipt fallback result',
      };
    }
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

  private async getSelectedGoal(userId: number): Promise<SavingGoal | null> {
    const selected = await this.goalRepo.findOne({
      where: { user: { id: userId }, is_selected: true },
      order: { updated_at: 'DESC' },
    });
    if (selected) return selected;

    return this.goalRepo.findOne({
      where: { user: { id: userId } },
      order: { updated_at: 'DESC' },
    });
  }

  private async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return this.categoryRepo.find({
      where: [{ user: { id: userId } }, { is_system: true }],
      relations: ['subCategories'],
      order: { is_system: 'DESC', id: 'ASC' },
    });
  }

  private pickSubCategoryByName(
    category: Category | undefined,
    name: string | null,
  ): SubCategory | undefined {
    if (!category || !name) return undefined;
    const normalized = norm(name);
    return (category.subCategories ?? []).find(
      (subCategory) =>
        norm(subCategory.name) === normalized ||
        norm(subCategory.name).includes(normalized) ||
        normalized.includes(norm(subCategory.name)),
    );
  }

  private async getCategories(
    userId: number,
    _goalId?: number,
  ): Promise<Category[]> {
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
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
          },
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

  private async handleGetTransactions(
    message: string,
    userId: number,
    goalId?: number,
  ): Promise<ApiResponse<string>> {
    const query = await this.parseGetTransactionQuery(message);

    const filter: any = {
      userId,
      savingGoalId: goalId,
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
    ocrText?: string,
    ocrLines?: string,
  ): Promise<ApiResponse<string>> {
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId must be a number');
    }

    if (message && message.startsWith('/confirm_saving_goal')) {
      return this.handleConfirmSavingGoal(message, userId);
    }
    if (message && message.startsWith('/change_saving_goal_duration')) {
      return this.handleChangeSavingGoalDuration(message, userId);
    }
    if (message && message.startsWith('/saving_goal_init_fund')) {
      return this.handleSavingGoalInitFund(message, userId);
    }

    if (ocrText) {
      return this.handleReceiptOcr(userId, ocrText, ocrLines);
    }

    const goalId =
      (await this.financialInsightsService.getSelectedGoalId(userId)) ?? 0;

    const lowerMessage = norm(message || '');
    const isAnalysisRequest =
      lowerMessage.includes('phan tich') ||
      lowerMessage.includes('ke hoach') ||
      lowerMessage.includes('ngan sach') ||
      lowerMessage.includes('khuyen');

    if (isAnalysisRequest) {
      return this.handleAnalysis(message ?? '', userId, goalId);
    }

    if (this.isSavingGoalRequest(message ?? '')) {
      return this.handleSavingGoalRequest(message ?? '', userId);
    }

    if (this.isGetTransactionRequest(message ?? '')) {
      return this.handleGetTransactions(message ?? '', userId, goalId);
    }

    const wallets = await this.walletRepo.find({
      where: { user: { id: userId }, is_active: true },
    });

    const categories = await this.getCategories(userId, goalId);
    const options: CatOption[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as any,
      subCategories: (c.subCategories ?? []).map((subCategory) => ({
        id: subCategory.id,
        name: subCategory.name,
        icon: subCategory.icon,
      })),
    }));

    if (!this.isLikelyTransactionMessage(message ?? '', categories)) {
      const answer = await this.chatAnswer(message ?? '');
      return { success: true, statusCode: 200, message: answer };
    }

    const walletOptions = wallets.map((w) => ({ id: w.id, name: w.name }));
    const parsedTrans = await this.parseTransaction(
      message ?? '',
      options,
      walletOptions,
    );

    if (parsedTrans.amount) {
      const amount = normalizeAmount(parsedTrans.amount);
      let pickedCategory = this.pickCategoryByName(
        categories,
        parsedTrans.category_name,
        parsedTrans.type,
      );

      if (!pickedCategory) {
        const fallback = await this.getFallbackCategoryFromDB(
          userId,
          parsedTrans.type,
        );
        if (fallback) pickedCategory = fallback;
      }
      const pickedSubCategory = this.pickSubCategoryByName(
        pickedCategory,
        parsedTrans.sub_category_name,
      );

      if (parsedTrans.needs_clarification) {
        return {
          success: true,
          statusCode: 200,
          message: `${MSG_PREFIX.TRANSACTION_SAVED}${JSON.stringify({
            amount,
            type: parsedTrans.type,
            category: pickedCategory?.name ?? 'Hóa đơn',
            categoryIcon: pickedCategory?.icon ?? '🧾',
            subCategory: null,
            note: parsedTrans.description,
            needsClarification: true,
            suggestedSubCategories:
              parsedTrans.suggested_sub_categories ??
              (pickedCategory?.subCategories ?? []).map((item) => item.name),
          })}`,
        };
      }

      if (amount) {
        this.logger.log(
          `[Chatbot Transaction] Saving ${parsedTrans.type}: amount=${amount}, category=${pickedCategory?.name || 'None'}, time=${parsedTrans.time}`,
        );

        // Resolve Wallet
        let walletId: number | undefined;
        let selectedWallet: Wallet | null = null;

        // 1. Priority: Explicitly mentioned wallet name
        if (parsedTrans.wallet_name) {
          walletId = this.findWalletIdByName(wallets, parsedTrans.wallet_name);
          if (walletId) {
            selectedWallet = wallets.find((w) => w.id === walletId) || null;
          }
        }

        // 2. Priority: Wallet linked to the selected Goal
        if (!walletId && goalId > 0) {
          const selectedGoal = await this.goalRepo.findOne({
            where: { id: goalId },
            relations: ['wallet'],
          });
          if (selectedGoal?.wallet && selectedGoal.wallet.is_active) {
            walletId = selectedGoal.wallet.id;
            selectedWallet = selectedGoal.wallet;
          }
        }

        // 3. Fallback: First active wallet
        if (!walletId && wallets.length > 0) {
          walletId = wallets[0].id;
          selectedWallet = wallets[0];
        }

        const dto: CreateTransactionDto = {
          userId,
          type: parsedTrans.type,
          amount,
          note: parsedTrans.description ?? 'Giao dịch từ chatbot',
          transactionDate: isValidDate(parsedTrans.time)
            ? new Date(parsedTrans.time!).toISOString()
            : new Date().toISOString(),
          categoryId: pickedCategory?.id,
          subCategoryId: pickedSubCategory?.id,
          walletId: walletId,
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
              subCategory: pickedSubCategory
                ? {
                    name: pickedSubCategory.name,
                    icon: pickedSubCategory.icon,
                  }
                : null,
            }),
            walletName: selectedWallet?.name,
            note: dto.note,
            isAutoFromReceipt: true,
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
    goalId?: number,
  ): Promise<ApiResponse<string>> {
    const resolvedGoalId =
      goalId ??
      (await this.financialInsightsService.getSelectedGoalId(userId)) ??
      0;

    const intentHash = this.buildIntentHash(message);
    const analysisCacheKey = buildAiAnalysisCacheKey(
      userId,
      resolvedGoalId,
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
        resolvedGoalId || undefined,
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
      resolvedGoalId,
      analysisCacheKey,
    );

    return { success: true, statusCode: 200, message: resultString };
  }

  async parseTransaction(
    message: string,
    options: CatOption[],
    wallets: Array<{ id: number; name: string }> = [],
  ): Promise<ChatTransactionResult> {
    try {
      const subCategoryRules = options
        .map(
          (option) =>
            `${option.name}: ${
              (option.subCategories ?? [])
                .map((subCategory) => subCategory.name)
                .join(', ') || 'khong co'
            }`,
        )
        .join('\n');
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
5. Ghi chú (description) phải ngắn gọn, tập trung vào nội dung chính. TUYỆT ĐỐI KHÔNG lặp lại số tiền trong phần ghi chú này.
6. category_name: He thong su dung bo danh muc CO DINH. Ban CHI DUOC PHEP chon tu danh sach: [${options.map((o) => o.name).join(', ')}]. TUYET DOI KHONG tu y tao ra ten danh muc moi.
7. sub_category_name: Chi duoc chon tu danh sach sub category co san ben duoi. Khong tu tao sub category moi.
Danh sach sub category:
${subCategoryRules}
8. Neu tin nhan mo ho nhu "tra hoa don 400k" thi needs_clarification=true, category_name="Hoa don", sub_category_name=null, suggested_sub_categories gom cac sub category phu hop.
9. Neu noi ro "tien dien", "tien nuoc", "hoc phi", "an trua" thi chon dung sub_category_name va needs_clarification=false.
10. Neu noi "dien nuoc 400k" nhung khong tach tien, needs_clarification=true.
11. wallet_name: Neu nguoi dung co nhac den ten vi (vd: "vi ATM", "tien mat", "Momo"), hay trich xuat ten vi do tu danh sach: [${wallets.map((w) => w.name).join(', ')}]. Neu khong nhac den, tra ve null.

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
                      sub_category_name: {
                        type: Type.STRING,
                        description:
                          'Ten danh muc con. Chi chon tu danh sach co san; null neu khong ro.',
                        nullable: true,
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
                      wallet_name: {
                        type: Type.STRING,
                        description: 'Ten vi nguoi dung nhac den',
                        nullable: true,
                      },
                      needs_clarification: {
                        type: Type.BOOLEAN,
                        description:
                          'true neu can hoi user xac nhan sub category truoc khi luu',
                      },
                      suggested_sub_categories: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                        description:
                          'Danh sach goi y sub category khi needs_clarification=true',
                      },
                    },
                    required: ['type', 'category_name', 'description'],
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
          },
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
        sub_category_name: args.sub_category_name ?? null,
        description: args.description ?? message,
        time: args.time ?? null,
        wallet_name: args.wallet_name ?? null,
        confidence: args.amount ? 1.0 : 0.0,
        needs_clarification: args.needs_clarification === true,
        suggested_sub_categories: Array.isArray(args.suggested_sub_categories)
          ? args.suggested_sub_categories
          : [],
      };
    } catch (error) {
      this.logger.error('Parse transaction failed', error);
      return {
        amount: null,
        type: 'expense',
        category_name: null,
        sub_category_name: null,
        description: null,
        time: null,
        wallet_name: null,
        confidence: 0,
        needs_clarification: false,
        suggested_sub_categories: [],
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
      return JSON5.parse(raw);
    } catch (error) {
      this.logger.error('Parse analysis JSON failed', error);
      return 'Toi gap loi khi chuan bi ke hoach tai chinh cho ban. Hay thu lai.';
    }
  }

  async generateGoalPlanInsight(
    dto: GoalPlanInsightDto,
  ): Promise<ApiResponse<GoalPlanInsightResponseDto>> {
    let daysDiff = 0;
    let projectionStatus: 'early' | 'delayed' | 'on_track' = 'on_track';

    const [yearStr, monthStr] = dto.selectedMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const daysInMonth = new Date(year, month, 0).getDate();

    const now = new Date();
    let daysPassed = 1;
    if (now.getFullYear() === year && now.getMonth() + 1 === month) {
      daysPassed = Math.max(1, Math.min(now.getDate(), daysInMonth));
    } else {
      const selectedDate = new Date(year, month - 1, 1);
      if (selectedDate < new Date(now.getFullYear(), now.getMonth(), 1)) {
        daysPassed = daysInMonth;
      } else {
        daysPassed = 1;
      }
    }

    let Tm = 0;
    let Sactual = 0;
    let goalName = dto.goal.name;

    try {
      const activeGoal =
        (await this.goalRepo.findOne({
          where: {
            user: { id: dto.userId },
            is_selected: true,
            is_completed: false,
          },
          relations: ['wallet'],
        })) ||
        (await this.goalRepo.findOne({
          where: { user: { id: dto.userId }, is_completed: false },
          relations: ['wallet'],
          order: { updated_at: 'DESC' },
        }));
      if (activeGoal) {
        goalName = activeGoal.name;
        const reportRes = await this.savingGoalsStatisticsService.getGoalReport(
          activeGoal.id,
          dto.userId,
        );
        if (reportRes.success && reportRes.data) {
          const report = reportRes.data;
          const currentMilestone = report.milestones?.find((m: any) => {
            const mStart = new Date(m.start_date);
            return (
              mStart.getFullYear() === year && mStart.getMonth() + 1 === month
            );
          });
          if (currentMilestone) {
            Tm = Number(currentMilestone.target || 0);
            Sactual = Number(currentMilestone.actual || 0);
            const Rplanned = Tm / daysInMonth;
            const Ractual = Sactual / daysPassed;
            const stageTargetRemaining = Math.max(0, Tm - Sactual);
            const daysPlannedRemaining = daysInMonth - daysPassed;
            if (stageTargetRemaining <= 0) {
              daysDiff = 0;
              projectionStatus = 'on_track';
            } else if (Ractual <= 0) {
              daysDiff = 999;
              projectionStatus = 'delayed';
            } else {
              const daysActualNeeded = stageTargetRemaining / Ractual;
              daysDiff = daysActualNeeded - daysPlannedRemaining;
              daysDiff = Math.round(daysDiff);
              if (daysDiff > 0) {
                projectionStatus = 'delayed';
              } else if (daysDiff < 0) {
                projectionStatus = 'early';
              } else {
                projectionStatus = 'on_track';
              }
            }
          }
        }
      }
    } catch (e) {
      this.logger.error('Error calculating mathematical early/late days', e);
    }

    const fallback = this.buildGoalPlanInsightFallback(
      dto,
      daysDiff,
      projectionStatus,
    );
    const prompt = `
Ban la tro ly tai chinh thong minh, chuyen nghiep va than thien cua ung dung Money Care.

NHIEM VU:
Dua tren du lieu so hoc da duoc tinh toan san va snapshot chi tieu ke hoach cua nguoi dung, hay viet mot bao cao phan tich (insight) tieng Viet cuc ky thuyet phuc va tu nhien ve muc tieu tiet kiem "${goalName}" trong thang nay.

DU LIEU DU DOAN CHINH XAC (BAT BUOC SU DUNG KHI VIET):
- So ngay chenh lech: ${daysDiff === 999 ? 'Trễ vô hạn (chưa có tích lũy)' : daysDiff > 0 ? `Trễ khoảng ${daysDiff} ngày` : daysDiff < 0 ? `Sớm khoảng ${Math.abs(daysDiff)} ngày` : 'Đúng tiến độ'}
- Trang thai du doan: ${projectionStatus === 'early' ? 'Hoàn thành SỚM' : projectionStatus === 'delayed' ? 'Hoàn thành TRỄ' : 'ĐÚNG TIẾN ĐỘ'}.
- Muc tieu chang thang nay (Tm): ${this.formatCurrency(Tm)}
- Da tich luy duoc trong thang nay (Sactual): ${this.formatCurrency(Sactual)}

YEU CAU NOI DUNG BAO CAO:
1. "summary" (Tom tat): Mot cau ngan gon duy nhat bao cao ket qua som/tre bao nhieu ngay dua tren "DU LIEU DU DOAN CHINH XAC" o tren. 
   - Neu som (vi du: am 5 ngày): phai dung tu ngu khen ngoi nhu "Tuyệt vời! Dự kiến chặng tiết kiệm tháng này sẽ hoàn thành sớm 5 ngày."
   - Neu tre (vi du: duong 8 ngày): viet "Dự kiến chặng tiết kiệm tháng này sẽ hoàn thành trễ khoảng 8 ngày."
   - Neu dung tien do (0 ngay): "Kế hoạch chặng tháng này của bạn đang rất xuất sắc và đúng tiến độ."
   - Neu tre vo han (999 ngay): "Kế hoạch chặng tháng này dự kiến sẽ không thể hoàn thành nếu không có điều chỉnh kịp thời."
2. "reason" (Ly do): Phai phan tich sau cac danh muc chi tieu (nhu An uong, Mua sam...) tu snapshot du lieu ben duoi. Chi ra chi tiet va chinh xac nhom nao dang lam anh huong, cham tre hoac thuc day tien do nhieu nhat. (Vi du: "Nhóm Ăn uống dang tieu vuot ke hoach...").
3. "suggestion" (De xuat): Gợi ý các hành động thực tế, thắt chặt chi tiêu ở nhóm cụ thể nào để đưa kế hoạch trở lại đúng hạn (nếu trễ) hoặc giữ vững phong độ (nếu sớm).

QUY TAC:
- Phai giu nguyen con so ngay som/tre tinh duoc o tren, khong tu y bia dat hoac thay doi so ngay khac.
- Tra loi bang tieng Viet, ngan gon, chuyen nghiep, khong dung tu ngu qua kieu cach.

OUTPUT JSON DUY NHAT:
{"status":"on_track|delayed","summary":string,"reason":string,"suggestion":string}

SNAPSHOT DU LIEU:
${JSON.stringify({ ...dto, daysDiff, projectionStatus, Tm, Sactual })}
`.trim();

    try {
      const result = await this.generateContent(
        prompt,
        undefined,
        undefined,
        this.analysisModel,
      );
      const parsed = this.safeJsonParse<GoalPlanInsightResult>(
        this.stripJsonFence(result.text || ''),
        fallback,
      );
      const normalized = this.normalizeGoalPlanInsight(parsed, fallback);

      // Inject correct mathematical values to ensure mathematical accuracy
      normalized.projectedDaysDiff = daysDiff;
      normalized.projectionStatus = projectionStatus;

      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: normalized,
        message: 'Generate goal plan insight successfully',
      });
    } catch (error) {
      this.logger.error('Generate goal plan insight failed', error);
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: fallback,
        message: 'Generate goal plan insight fallback result',
      });
    }
  }

  private normalizeGoalPlanInsight(
    value: GoalPlanInsightResult,
    fallback: GoalPlanInsightResponseDto,
  ): GoalPlanInsightResponseDto {
    const status =
      value.status === 'delayed'
        ? GoalPlanProgressStatus.DELAYED
        : GoalPlanProgressStatus.ON_TRACK;

    return {
      status,
      summary:
        typeof value.summary === 'string' && value.summary.trim()
          ? value.summary.trim()
          : fallback.summary,
      reason:
        typeof value.reason === 'string' && value.reason.trim()
          ? value.reason.trim()
          : fallback.reason,
      suggestion:
        typeof value.suggestion === 'string' && value.suggestion.trim()
          ? value.suggestion.trim()
          : fallback.suggestion,
    };
  }

  private buildGoalPlanInsightFallback(
    dto: GoalPlanInsightDto,
    daysDiff: number = 0,
    projectionStatus: string = 'on_track',
  ): GoalPlanInsightResponseDto {
    const delayedCategories = [...(dto.categories ?? [])]
      .filter((item) => item.status === GoalPlanProgressStatus.DELAYED)
      .sort((a, b) => b.overAmount - a.overAmount);
    const topCategory = delayedCategories[0];

    let fallbackStatus = GoalPlanProgressStatus.ON_TRACK;
    let fallbackSummary = 'Kế hoạch tháng này vẫn đúng tiến độ.';
    let fallbackReason =
      'Chi tiêu hiện tại chưa vượt phần kế hoạch nên dùng tới hôm nay.';
    let fallbackSuggestion =
      'Tiếp tục giữ nhịp chi hiện tại và theo dõi các nhóm chi lớn trong tháng.';

    if (projectionStatus === 'delayed') {
      fallbackStatus = GoalPlanProgressStatus.DELAYED;
      if (daysDiff === 999) {
        fallbackSummary =
          'Kế hoạch chặng tháng này dự kiến sẽ không thể hoàn thành nếu không có điều chỉnh kịp thời.';
        fallbackReason = topCategory
          ? `Bạn chưa có tích lũy thêm cho chặng này và nhóm chi tiêu ${topCategory.name} đang vượt hạn mức lũy tiến ${this.formatCurrency(topCategory.overAmount)}.`
          : 'Bạn chưa có tích lũy thêm cho chặng này và tổng chi tiêu hiện tại đang vượt hạn mức progressive.';
        fallbackSuggestion = topCategory
          ? `Hãy cố gắng tiết kiệm chi tiêu đặc biệt là ở nhóm ${topCategory.name} để có số dư trích lập vào mục tiêu.`
          : 'Hãy cố gắng thắt chặt chi tiêu để có số dư chuyển vào ví tích lũy sớm nhất.';
      } else {
        fallbackSummary = `Dự kiến mục tiêu chặng tháng này sẽ hoàn thành trễ khoảng ${daysDiff} ngày so với kế hoạch.`;
        fallbackReason = topCategory
          ? `Do tốc độ tích lũy thực tế giảm và nhóm ${topCategory.name} đang chi vượt ${this.formatCurrency(topCategory.overAmount)}.`
          : `Do tốc độ tích lũy thực tế giảm so với mức kế hoạch hàng ngày.`;
        fallbackSuggestion = topCategory
          ? `Cắt giảm bớt chi tiêu nhóm ${topCategory.name} để đưa mục tiêu về đúng tiến độ.`
          : `Giảm bớt chi tiêu không thiết yếu để tăng tốc độ tích lũy hàng ngày.`;
      }
    } else if (projectionStatus === 'early') {
      const absDays = Math.abs(daysDiff);
      fallbackSummary = `Tuyệt vời! Dự kiến mục tiêu chặng tháng này sẽ hoàn thành sớm ${absDays} ngày.`;
      fallbackReason =
        'Bạn đang duy trì tốc độ tích lũy rất tốt và kiểm soát chi tiêu các nhóm ở mức an toàn.';
      fallbackSuggestion =
        'Bạn có thể tiếp tục phong độ này hoặc trích thêm tiền dư vào ví tiết kiệm để duy trì đà tăng tốc.';
    }

    return {
      status: fallbackStatus,
      summary: fallbackSummary,
      reason: fallbackReason,
      suggestion: fallbackSuggestion,
      projectedDaysDiff: daysDiff,
      projectionStatus: projectionStatus as any,
    };
  }

  private formatCurrency(amount: number): string {
    return amount.toLocaleString('vi-VN') + 'đ';
  }

  async chatAnswer(text: string): Promise<string> {
    const cacheKey = this.buildChatCacheKey(text);
    const cached = await this.cacheService.get<string>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const result = await this.generateContent(
      `Ban la tro ly tai chinh thong minh cua ung dung Money Care.
NHIEM VU: Ho tro nguoi dung ve cac chuyen de tai chinh, chi tieu, tiet kiem va cách su dung cac tinh nang cua app Money Care.
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

  private findWalletIdByName(
    wallets: Wallet[],
    name: string,
  ): number | undefined {
    const normalized = norm(name);
    const match =
      wallets.find((w) => norm(w.name) === normalized) ||
      wallets.find(
        (w) =>
          norm(w.name).includes(normalized) ||
          normalized.includes(norm(w.name)),
      );
    return match?.id;
  }

  private async handleReceiptOcr(
    userId: number,
    ocrText: string,
    ocrLines?: string,
  ): Promise<ApiResponse<string>> {
    try {
      const goalId =
        (await this.financialInsightsService.getSelectedGoalId(userId)) ?? 0;
      const categories = await this.getCategories(userId, goalId);
      const wallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });

      // 1. Scan receipt using Gemini
      const scanBody = { ocrText, ocrLines };
      const scanResult = await this.scanReceipt(scanBody, categories);

      if (!scanResult.success || !scanResult.data) {
        this.logger.warn(
          `[handleReceiptOcr] Scan failed: ${scanResult.message}`,
        );
        return {
          success: false,
          statusCode: 400,
          message: 'Không thể xử lý hóa đơn này. Vui lòng thử lại.',
        };
      }

      const data = scanResult.data;
      let amount = data.total_amount;

      if (amount <= 0 && ocrText) {
        const lines = ocrText.split('\n');
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].replace(/[,.]/g, '');
          const match = line.match(/(\d{4,10})/);
          if (match) {
            amount = parseInt(match[1], 10);
            break;
          }
        }
      }

      if (amount <= 0) {
        return {
          success: true,
          statusCode: 200,
          message:
            'Tôi đã đọc hóa đơn nhưng không tìm thấy số tiền hợp lệ. Bạn vui lòng kiểm tra lại ảnh nhé.',
        };
      }

      // 2. Automatic Categorization
      let pickedCategory = this.pickCategoryByName(
        categories,
        data.category_name || data.merchant_name,
        'expense',
      );

      if (data.category_name) {
        const aiMatch = categories.find(
          (c) =>
            norm(c.name).includes(norm(data.category_name)) ||
            norm(data.category_name).includes(norm(c.name)),
        );
        if (aiMatch) pickedCategory = aiMatch;
      }

      if (!pickedCategory) {
        const fallback = await this.getFallbackCategoryFromDB(
          userId,
          'expense',
        );
        if (fallback) pickedCategory = fallback;
      }

      let walletId: number | undefined;
      let selectedWallet: Wallet | null = null;

      if (goalId > 0) {
        const selectedGoal = await this.goalRepo.findOne({
          where: { id: goalId },
          relations: ['wallet'],
        });
        if (selectedGoal?.wallet && selectedGoal.wallet.is_active) {
          walletId = selectedGoal.wallet.id;
          selectedWallet = selectedGoal.wallet;
        }
      }

      if (!walletId && wallets.length > 0) {
        walletId = wallets[0].id;
        selectedWallet = wallets[0];
      }

      const dto: CreateTransactionDto = {
        userId,
        type: 'expense',
        amount,
        note:
          data.suggested_note ||
          `Hóa đơn tại ${data.merchant_name || 'Cửa hàng'}`,
        transactionDate:
          data.date && isValidDate(data.date)
            ? new Date(data.date).toISOString()
            : new Date().toISOString(),
        categoryId: pickedCategory?.id,
        walletId: walletId,
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
          walletName: selectedWallet?.name,
          note: dto.note,
          isAutoFromReceipt: true,
        })}`,
      };
    } catch (error) {
      this.logger.error('[handleReceiptOcr] Error', error);
      return {
        success: false,
        statusCode: 500,
        message: `Có lỗi xảy ra khi tự động lưu hóa đơn: ${error.message}`,
      };
    }
  }

  private formatVnd(amount: number): string {
    return Math.round(amount).toLocaleString('vi-VN') + 'đ';
  }

  private buildSavingGoalRecommendation(
    target: number,
    monthlyCapacity: number,
  ): {
    months: number;
    suggestedMonthlySaving: number;
    maxMonthlySaving: number;
    rawMonths: number;
    rawDurationText: string;
    safetyRatio: number;
  } {
    const maxMonthlySaving = Math.max(0, monthlyCapacity);
    if (target <= 0 || maxMonthlySaving <= 0) {
      return {
        months: 6,
        suggestedMonthlySaving: target > 0 ? Math.round(target / 6) : 0,
        maxMonthlySaving,
        rawMonths: 0,
        rawDurationText: '6 tháng',
        safetyRatio: 0,
      };
    }

    const rawMonths = target / maxMonthlySaving;
    let months = Math.max(1, Math.ceil(rawMonths));
    let suggestedMonthlySaving = Math.ceil(target / months);

    const safeLimit = maxMonthlySaving * 0.9;
    if (months > 1 && suggestedMonthlySaving > safeLimit) {
      months += 1;
      suggestedMonthlySaving = Math.ceil(target / months);
    }

    return {
      months,
      suggestedMonthlySaving,
      maxMonthlySaving,
      rawMonths,
      rawDurationText: this.formatDurationFromMonths(rawMonths),
      safetyRatio:
        maxMonthlySaving > 0 ? suggestedMonthlySaving / maxMonthlySaving : 0,
    };
  }

  private formatDurationFromMonths(monthsValue: number): string {
    const wholeMonths = Math.floor(monthsValue);
    const days = Math.round((monthsValue - wholeMonths) * 30);

    if (wholeMonths > 0 && days > 0) {
      return `${wholeMonths} tháng ${days} ngày`;
    }
    if (wholeMonths > 0) {
      return `${wholeMonths} tháng`;
    }
    return `${Math.max(1, days)} ngày`;
  }

  private buildDurationOptions(target: number, recommendedMonths: number) {
    const normalizedMonths = Math.max(1, recommendedMonths || 1);
    const fasterMonths = Math.max(1, normalizedMonths - 1);
    const optionMonths = Array.from(
      new Set([fasterMonths, normalizedMonths, normalizedMonths + 1]),
    );

    return optionMonths.map((months) => {
      const type =
        months < normalizedMonths
          ? 'faster'
          : months === normalizedMonths
            ? 'recommended'
            : 'relaxed';

      return {
        type,
        label:
          type === 'faster'
            ? 'Gấp'
            : type === 'recommended'
              ? 'Khuyến nghị'
              : 'Thoải mái',
        months,
        monthlySaving: Math.ceil(target / months),
        isRecommended: type === 'recommended',
      };
    });
  }

  private isSavingGoalRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const savingKeywords = [
      'tiet kiem',
      'gom tien',
      'muc tieu',
      'muon mua',
      'de danh',
      'gop tien',
      'saving',
      'goal',
    ];

    const hasAmount =
      /\d/.test(normalized) ||
      /\b(k|nghin|ngan|tr|trieu|cu|dong|vnd)\b/.test(normalized);

    return savingKeywords.some((kw) => normalized.includes(kw)) && hasAmount;
  }

  private async handleSavingGoalRequest(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);

      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;

      const capacityContext = capacity
        ? `Nguoi dung co Ke hoach chi tieu dang hoat dong:
  - Tong ngan sach (Thu nhap): ${capacity.totalAmount} VND/thang
  - Chi phi co dinh: ${capacity.fixedExpenseTotal} VND/thang
  - Kha nang tiet kiem theo ke hoach: ${plannedSavingCapacity} VND/thang
  - So du linh hoat con lai du kien cuoi thang: ${capacity.projectedEndBalance} VND`
        : 'Nguoi dung CHUA co ke hoach chi tieu. Hay khuyen ho tao ke hoach truoc.';

      const response = await this.genAI.models.generateContent({
        model: this.parseModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Ban la tro ly tai chinh thong minh cua app Money Care.
NHIEM VU: Trich xuat thong tin muc tieu tiet kiem tu tin nhan nguoi dung.

THONG TIN TAI CHINH HIEN TAI:
${capacityContext}

QUY TAC:
1. name: Ten muc tieu (vd: "Mua dien thoai", "Du lich Da Nang").
2. target: So tien muc tieu (VND). Neu nguoi dung noi "3 trieu" -> 3000000, "500k" -> 500000.
3. requested_months: So thang nguoi dung noi ro trong tin nhan. Vi du "trong 5 thang", "5 thang nua", "trong vong 5 thang" -> 5. Neu nguoi dung KHONG noi thoi gian cu the thi tra ve null.
4. months_estimate: Uoc tinh so thang can thiet = target / kha_nang_tiet_kiem_moi_thang. Lam tron len.
   Neu khong co ke hoach chi tieu, hay uoc tinh khoang 6 thang. Neu co requested_months thi months_estimate van co the bang requested_months.

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
                  name: 'propose_saving_goal',
                  description: 'De xuat muc tieu tiet kiem moi cho nguoi dung',
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      name: {
                        type: Type.STRING,
                        description: 'Ten muc tieu tiet kiem',
                      },
                      target: {
                        type: Type.NUMBER,
                        description: 'So tien muc tieu (VND)',
                      },
                      months_estimate: {
                        type: Type.NUMBER,
                        description:
                          'So thang uoc tinh de hoan thanh (lam tron len)',
                      },
                      requested_months: {
                        type: Type.NUMBER,
                        description:
                          'So thang nguoi dung yeu cau ro trong tin nhan; null neu khong co',
                        nullable: true,
                      },
                    },
                    required: ['name', 'target', 'months_estimate'],
                  },
                },
              ],
            },
          ],
          toolConfig: {
            functionCallingConfig: { mode: FunctionCallingConfigMode.ANY },
          },
        },
      });

      const calls = (response as any).functionCalls as any[] | undefined;
      const args = calls?.[0]?.args;
      if (!args) {
        return {
          success: true,
          statusCode: 200,
          message:
            'Tôi chưa hiểu rõ mục tiêu tiết kiệm của bạn. Bạn có thể nói rõ hơn không? Ví dụ: "Tôi muốn tiết kiệm 3 triệu mua điện thoại".',
        };
      }

      const name = args.name || 'Mục tiêu tiết kiệm';
      const target = Number(args.target) || 0;
      const requestedMonths = Number(args.requested_months) || 0;

      // Kiểm tra ví có tiền để hỏi trích nạp ban đầu
      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });
      const positiveWallets = activeWallets.filter(
        (w) => w.type !== 'saving' && Number(w.balance) > 0,
      );

      if (positiveWallets.length > 0 && target > 0) {
        const totalPositiveBalance = positiveWallets.reduce(
          (sum, w) => sum + Number(w.balance),
          0,
        );
        let suggestedWallet = positiveWallets[0];
        for (const w of positiveWallets) {
          if (Number(w.balance) > Number(suggestedWallet.balance)) {
            suggestedWallet = w;
          }
        }

        const walletsData = positiveWallets.map((w) => ({
          id: w.id,
          name: w.name,
          balance: Number(w.balance),
          type: w.type,
        }));

        return {
          success: true,
          statusCode: 200,
          message: `${MSG_PREFIX.SAVING_GOAL_INITIAL_FUND_ASK}${JSON.stringify({
            name,
            target,
            wallets: walletsData,
            totalBalance: totalPositiveBalance,
            suggestedWalletId: suggestedWallet.id,
            requestedMonths,
          })}`,
        };
      }

      const hasRequestedMonths = requestedMonths > 0;
      let monthsEstimate = Number(args.months_estimate) || 6;
      let aiMessage = '';
      let suggestedMonthlySaving = Math.round(target / monthsEstimate);
      let maxMonthlySaving = plannedSavingCapacity;
      let isWarning = false;

      if (hasRequestedMonths) {
        monthsEstimate = Math.max(1, Math.round(requestedMonths));
        suggestedMonthlySaving = Math.ceil(target / monthsEstimate);
        maxMonthlySaving = plannedSavingCapacity;

        if (!capacity) {
          aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" với số tiền "${this.formatVnd(target)}" trong "${monthsEstimate} tháng", tương đương khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng". Vì bạn chưa thiết lập Kế hoạch chi tiêu, tôi chưa thể đánh giá chính xác mức độ khả thi.`;
        } else {
          const income = capacity.totalAmount;
          const fixedExpense = capacity.fixedExpenseTotal;
          const maxPossibleSaving = income - fixedExpense;

          if (suggestedMonthlySaving > maxPossibleSaving) {
            isWarning = true;
            aiMessage = `⚠️ Cảnh báo: Bạn muốn hoàn thành mục tiêu "${name}" trong "${monthsEstimate} tháng", cần tiết kiệm khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng". Nhưng với thu nhập hiện tại là "${this.formatVnd(income)}" và chi phí cố định là "${this.formatVnd(fixedExpense)}", mức tối đa hiện tại chỉ khoảng "${this.formatVnd(maxPossibleSaving)}/tháng". Bạn vẫn có thể tạo mục tiêu này nếu muốn thử thách bản thân.`;
          } else if (suggestedMonthlySaving > plannedSavingCapacity) {
            isWarning = true;
            const extraNeeded = suggestedMonthlySaving - plannedSavingCapacity;
            aiMessage = `⚠️ Để hoàn thành mục tiêu "${name}" trong "${monthsEstimate} tháng", bạn cần tiết kiệm khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng", cao hơn khả năng hiện tại khoảng "${this.formatVnd(extraNeeded)}/tháng". Bạn vẫn có thể tạo mục tiêu nếu chấp nhận điều chỉnh chi tiêu.`;
          } else {
            aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" trong "${monthsEstimate} tháng". Với mức cần tiết kiệm khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng", kế hoạch này nằm trong khả năng tiết kiệm hiện tại "${this.formatVnd(plannedSavingCapacity)}/tháng" của bạn.`;
          }
        }
      } else if (capacity && plannedSavingCapacity > 0) {
        const capacityVal = plannedSavingCapacity;
        const recommendation = this.buildSavingGoalRecommendation(
          target,
          capacityVal,
        );
        monthsEstimate = recommendation.months;
        suggestedMonthlySaving = recommendation.suggestedMonthlySaving;
        maxMonthlySaving = recommendation.maxMonthlySaving;

        aiMessage = `Với khả năng tiết kiệm tối đa hiện tại là "${this.formatVnd(recommendation.maxMonthlySaving)}/tháng", nếu dùng hết số dư bạn sẽ cần khoảng "${recommendation.rawDurationText}" để tích lũy đủ "${this.formatVnd(target)}" cho mục tiêu "${name}".\n\n💡 Để kế hoạch dễ theo dõi và không dùng hết toàn bộ số dư mỗi tháng, tôi đề xuất mốc "${recommendation.months} tháng", tương đương khoảng "${this.formatVnd(recommendation.suggestedMonthlySaving)}/tháng". Bạn vẫn có thể đổi thời gian nếu muốn hoàn thành nhanh hơn hoặc thoải mái hơn.`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(target / 6);
        aiMessage = `Tôi đã ghi nhận đề xuất tích lũy "${this.formatVnd(target)}" cho mục tiêu "${name}". Vì kế hoạch chi tiêu hiện tại của bạn chưa có thặng dư để tích lũy (khả năng tiết kiệm hiện tại là 0đ/tháng), tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng"). Bạn hãy điều chỉnh kế hoạch chi tiêu hoặc cắt giảm chi phí để gia tăng khả năng tiết kiệm nhé!`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(target / 6);
        aiMessage = `Tôi đã ghi nhận đề xuất tích lũy "${this.formatVnd(target)}" cho mục tiêu "${name}". Vì bạn chưa thiết lập Kế hoạch chi tiêu, tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${this.formatVnd(Math.round(target / 6))}/tháng"). Bạn hãy lập Kế hoạch chi tiêu để theo dõi chính xác hơn nhé!`;
      }

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + monthsEstimate);
      const durationOptions = hasRequestedMonths
        ? []
        : this.buildDurationOptions(target, monthsEstimate);

      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target,
          monthsEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving,
          maxMonthlySaving,
          durationOptions,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          isRequestedDuration: hasRequestedMonths,
          aiMessage,
        })}`,
      };
    } catch (error) {
      this.logger.error('Handle saving goal request failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Tôi gặp lỗi khi đề xuất mục tiêu tiết kiệm. Bạn vui lòng thử lại nhé!',
      };
    }
  }

  private async handleConfirmSavingGoal(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const payloadStr = message.replace('/confirm_saving_goal', '').trim();
      const payload = JSON.parse(payloadStr);

      const { name, target, months, initFund, sourceWalletId } = payload;
      const monthsEstimate = Number(months) || 6;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + monthsEstimate);

      const createResult = await this.savingGoalsService.create(
        {
          name: name || 'Mục tiêu tiết kiệm',
          target: Number(target) || 0,
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          create_new_wallet: true,
        },
        userId,
      );

      const createdGoal = createResult.data;
      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;
      const suggestedMonthlySaving = Math.round(
        Number(target) / monthsEstimate,
      );

      const user = await this.userRepo.findOne({ where: { id: userId } });
      const activeInitFund = Number(initFund) || 0;
      const activeSourceWalletId = Number(sourceWalletId) || 0;

      let transferSuccess = false;
      let sourceWalletName = '';

      if (
        activeInitFund > 0 &&
        activeSourceWalletId > 0 &&
        createdGoal?.wallet?.id &&
        user
      ) {
        try {
          const sourceWallet = await this.walletRepo.findOne({
            where: { id: activeSourceWalletId },
          });
          if (sourceWallet) {
            sourceWalletName = sourceWallet.name;
            await this.walletsService.transfer(
              {
                fromWalletId: activeSourceWalletId,
                toWalletId: createdGoal.wallet.id,
                amount: activeInitFund,
                note: `Tích lũy ban đầu cho mục tiêu: ${name}`,
              },
              user,
            );
            transferSuccess = true;
          }
        } catch (transferError) {
          this.logger.error(
            'Failed to transfer initial fund during confirm saving goal',
            transferError,
          );
        }
      }

      let aiMessage = `Tuyệt vời! Tôi đã tạo thành công mục tiêu "${name}" với số tiền cần tích lũy là "${this.formatVnd(target)}" trong vòng "${monthsEstimate} tháng". Một ví mục tiêu mới cũng đã được kích hoạt để bạn bắt đầu tích lũy!`;
      if (transferSuccess && activeInitFund > 0) {
        aiMessage = `Tuyệt vời! Tôi đã tạo thành công mục tiêu "${name}" với số tiền cần tích lũy là "${this.formatVnd(target)}" trong vòng "${monthsEstimate} tháng". Đồng thời, tôi đã tự động trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}" chuyển sang ví tích lũy "${createdGoal?.wallet?.name}" của mục tiêu này làm vốn ban đầu!`;
      }

      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.SAVING_GOAL_CREATED}${JSON.stringify({
          goalId: createdGoal?.id,
          name,
          target: Number(target),
          monthsEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving,
          maxMonthlySaving: plannedSavingCapacity,
          hasPlan: !!capacity,
          initFund: activeInitFund,
          sourceWalletId: activeSourceWalletId,
          aiMessage,
        })}`,
      };
    } catch (error) {
      this.logger.error('Confirm saving goal failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Có lỗi xảy ra khi xác nhận tạo mục tiêu tiết kiệm. Vui lòng thử lại!',
      };
    }
  }

  private async handleSavingGoalInitFund(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const payloadStr = message.replace('/saving_goal_init_fund', '').trim();
      const payload = JSON.parse(payloadStr);

      const { name, target, initFund, sourceWalletId, requestedMonths } =
        payload;
      const activeInitFund = Number(initFund) || 0;
      const activeSourceWalletId = Number(sourceWalletId) || 0;
      const remainingTarget = Math.max(0, Number(target) - activeInitFund);

      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;
      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });
      const sourceWallet = activeWallets.find(
        (w) => w.id === activeSourceWalletId,
      );
      const sourceWalletName = sourceWallet?.name ?? 'ví đã chọn';

      const parsedRequestedMonths = Number(requestedMonths) || 0;
      const hasRequestedMonths = parsedRequestedMonths > 0;
      let monthsEstimate = 6;
      let suggestedMonthlySaving = Math.round(remainingTarget / monthsEstimate);
      let maxMonthlySaving = plannedSavingCapacity;
      let isWarning = false;
      let aiMessage = '';

      if (remainingTarget <= 0) {
        monthsEstimate = 0;
        suggestedMonthlySaving = 0;
        aiMessage = `Tuyệt vời! Bạn trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, đủ để hoàn thành mục tiêu "${name}" trị giá "${this.formatVnd(target)}" ngay lập tức! Bạn có muốn tiến hành tạo mục tiêu ngay không?`;
      } else if (hasRequestedMonths) {
        monthsEstimate = Math.max(1, Math.round(parsedRequestedMonths));
        suggestedMonthlySaving = Math.ceil(remainingTarget / monthsEstimate);
        maxMonthlySaving = plannedSavingCapacity;

        if (!capacity) {
          aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" với số tiền còn thiếu "${this.formatVnd(remainingTarget)}" (sau khi trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}") trong "${monthsEstimate} tháng", tương đương khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng". Hãy tạo kế hoạch chi tiêu trước để xem chi tiết mức độ khả thi nhé!`;
        } else {
          const income = capacity.totalAmount;
          const fixedExpense = capacity.fixedExpenseTotal;
          const maxPossibleSaving = income - fixedExpense;

          if (suggestedMonthlySaving > maxPossibleSaving) {
            isWarning = true;
            aiMessage = `⚠️ Cảnh báo: Bạn muốn hoàn thành mục tiêu "${name}" trong "${monthsEstimate} tháng", cần tiết kiệm khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng" cho phần còn thiếu "${this.formatVnd(remainingTarget)}". Nhưng với thu nhập hiện tại và chi phí cố định, mức tối đa chỉ khoảng "${this.formatVnd(maxPossibleSaving)}/tháng".`;
          } else if (suggestedMonthlySaving > plannedSavingCapacity) {
            isWarning = true;
            const extraNeeded = suggestedMonthlySaving - plannedSavingCapacity;
            aiMessage = `⚠️ Để hoàn thành mục tiêu "${name}" trong "${monthsEstimate} tháng", bạn cần tiết kiệm khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng" cho phần còn thiếu "${this.formatVnd(remainingTarget)}", cao hơn khả năng hiện tại khoảng "${this.formatVnd(extraNeeded)}/tháng". Bạn vẫn có thể tạo mục tiêu nếu chấp nhận điều chỉnh chi tiêu.`;
          } else {
            aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" trong "${monthsEstimate} tháng" với số tiền còn lại cần tích lũy là "${this.formatVnd(remainingTarget)}" (đã trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Với mức cần tiết kiệm khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng", kế hoạch này nằm trong khả năng tiết kiệm hiện tại "${this.formatVnd(plannedSavingCapacity)}/tháng" của bạn.`;
          }
        }
      } else if (capacity && plannedSavingCapacity > 0) {
        const capacityVal = plannedSavingCapacity;
        const recommendation = this.buildSavingGoalRecommendation(
          remainingTarget,
          capacityVal,
        );
        monthsEstimate = recommendation.months;
        suggestedMonthlySaving = recommendation.suggestedMonthlySaving;
        maxMonthlySaving = recommendation.maxMonthlySaving;

        aiMessage = `Sau khi trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, bạn còn thiếu "${this.formatVnd(remainingTarget)}" cho mục tiêu "${name}".\n\n💡 Để kế hoạch thoải mái, tôi đề xuất mốc "${recommendation.months} tháng", tương đương khoảng "${this.formatVnd(recommendation.suggestedMonthlySaving)}/tháng" (nằm trong khả năng tiết kiệm "${this.formatVnd(plannedSavingCapacity)}/tháng" của bạn).`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(remainingTarget / 6);
        aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" (còn thiếu "${this.formatVnd(remainingTarget)}" sau khi trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Vì kế hoạch chi tiêu hiện tại của bạn chưa có thặng dư để tích lũy (khả năng tiết kiệm hiện tại là 0đ/tháng), tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng"). Bạn có thể điều chỉnh kế hoạch chi tiêu để gia tăng tích lũy nhé!`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(remainingTarget / 6);
        aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" (còn thiếu "${this.formatVnd(remainingTarget)}" sau khi trích "${this.formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Vì bạn chưa có Kế hoạch chi tiêu, tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${this.formatVnd(suggestedMonthlySaving)}/tháng").`;
      }

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + (monthsEstimate || 1));
      const durationOptions =
        hasRequestedMonths || remainingTarget <= 0
          ? []
          : this.buildDurationOptions(remainingTarget, monthsEstimate);

      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target: Number(target),
          initFund: activeInitFund,
          sourceWalletId: activeSourceWalletId,
          remainingTarget,
          monthsEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving,
          maxMonthlySaving,
          durationOptions,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          isRequestedDuration: hasRequestedMonths,
          aiMessage,
        })}`,
      };
    } catch (error) {
      this.logger.error('Handle saving goal init fund failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Tôi gặp lỗi khi đề xuất lộ trình dựa trên số vốn ban đầu. Vui lòng thử lại!',
      };
    }
  }

  private async handleChangeSavingGoalDuration(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const payloadStr = message
        .replace('/change_saving_goal_duration', '')
        .trim();
      const payload = JSON.parse(payloadStr);

      const { name, target, months } = payload;
      const requestedMonths = Math.max(1, Number(months));

      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;
      const requiredPerMonth = Math.round(target / requestedMonths);
      const maxMonthlySaving = plannedSavingCapacity;

      let aiMessage = '';
      let isWarning = false;

      if (!capacity) {
        aiMessage = `Bạn muốn hoàn thành mục tiêu "${name}" (${this.formatVnd(target)}) trong vòng "${requestedMonths} tháng" (cần tích lũy khoảng "${this.formatVnd(requiredPerMonth)}/tháng"). Hãy tạo kế hoạch chi tiêu trước để xem chi tiết mức độ khả thi nhé!`;
      } else {
        const income = capacity.totalAmount;
        const fixedExpense = capacity.fixedExpenseTotal;
        const maxPossibleSaving = income - fixedExpense;

        if (requiredPerMonth > maxPossibleSaving) {
          isWarning = true;
          aiMessage = `⚠️ Cảnh báo: Để hoàn thành trong "${requestedMonths} tháng", bạn cần tiết kiệm đến "${this.formatVnd(requiredPerMonth)}/tháng". Nhưng với thu nhập hiện tại của bạn là "${this.formatVnd(income)}" và chi phí cố định là "${this.formatVnd(fixedExpense)}", mức tối đa hiện tại chỉ khoảng "${this.formatVnd(maxPossibleSaving)}/tháng". Bạn vẫn có thể tạo mục tiêu này nếu muốn thử thách bản thân, nhưng nên chuẩn bị phương án tăng thu nhập hoặc giảm thêm chi phí.`;
        } else if (requiredPerMonth > plannedSavingCapacity) {
          isWarning = true;
          const extraNeeded = requiredPerMonth - plannedSavingCapacity;
          aiMessage = `⚠️ Cần điều chỉnh chi tiêu linh hoạt! Để hoàn thành trong "${requestedMonths} tháng", bạn cần tiết kiệm "${this.formatVnd(requiredPerMonth)}/tháng". Khả năng hiện tại của bạn là "${this.formatVnd(plannedSavingCapacity)}/tháng", nghĩa là bạn cần cắt giảm thêm khoảng "${this.formatVnd(extraNeeded)}/tháng" từ các khoản chi tiêu linh hoạt trong kế hoạch của mình. Bạn vẫn có thể tạo mục tiêu nếu chấp nhận mức thử thách này.`;
        } else {
          aiMessage = `✨ Tuyệt vời! Kế hoạch tài chính hiện tại của bạn dư sức đạt được mục tiêu này trong "${requestedMonths} tháng" với mức tiết kiệm chỉ "${this.formatVnd(requiredPerMonth)}/tháng" (thấp hơn khả năng tiết kiệm tối đa "${this.formatVnd(plannedSavingCapacity)}/tháng" của bạn).`;
        }
      }

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + requestedMonths);
      const durationOptions = this.buildDurationOptions(
        target,
        requestedMonths,
      );

      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target,
          monthsEstimate: requestedMonths,
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving: requiredPerMonth,
          maxMonthlySaving,
          durationOptions,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          aiMessage,
          endDate: endDate.toISOString(),
        })}`,
      };
    } catch (error) {
      this.logger.error('Change saving goal duration failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Có lỗi xảy ra khi điều chỉnh thời gian mục tiêu. Vui lòng thử lại!',
      };
    }
  }
}
