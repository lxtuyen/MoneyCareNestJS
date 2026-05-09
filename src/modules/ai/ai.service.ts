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
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import {
  CatOption,
  CategoryQuery,
  ChatTransactionResult,
  FinancialAnalysisResult,
  FinancialInsightSnapshot,
  GetTransactionQuery,
} from './types/ai.types';
import { FinancialInsightsService } from './financial-insights.service';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildAiAnalysisCacheKey,
  buildAiAnalysisRegistryKey,
} from 'src/common/cache/financial-cache.util';

const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const AI_ANALYSIS_TTL_SECONDS = 300;
const AI_ANALYSIS_REGISTRY_TTL_SECONDS = 300;
const CHAT_TTL_SECONDS = 60;

const MSG_PREFIX = {
  TRANSACTION_LIST: '__TRANSACTION_LIST__',
  TRANSACTION_SAVED: '__TRANSACTION_SAVED__',
  STRUCTURED_ANALYSIS: '__STRUCTURED_ANALYSIS__',
  CATEGORY_LIST: '__CATEGORY_LIST__',
  CATEGORY_CREATED: '__CATEGORY_CREATED__',
};

interface ReceiptOcrLine {
  text: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface ReceiptRuleCandidate {
  merchantName?: string;
  transactionDate?: string;
  totalAmount?: number;
  currency?: string;
  confidence?: number;
  warnings?: string[];
}

export interface ScanReceiptModel {
  rawText: string;
  merchantName: string;
  address: string;
  date: string;
  totalAmount: number;
  currency: string;
  categoryKey: string;
  categoryName: string;
  suggestedNote?: string;
}

export interface ScanReceiptResponse {
  raw_text: string;
  merchant_name: string;
  address: string;
  date: string;
  total_amount: number;
  currency: string;
  category_key: string;
  category_name: string;
  suggested_note?: string;
}

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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
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
      return JSON5.parse(value) as T;
    } catch {
      return fallback;
    }
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
      confidence:
        Number.isFinite(Number(raw.confidence)) ? Number(raw.confidence) : 0,
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
    const ocrLinesBlock = ocrLines.length
      ? JSON.stringify(ocrLines)
      : '[]';
    const ruleBlock = JSON.stringify(ruleCandidate);
    const categoryNames = categories.map(c => c.name).join(', ');

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
 - Hay chon categoryName phu hop nhat tu danh sach nay: [${categoryNames}].
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
    file: Express.Multer.File | undefined,
    body: Record<string, string | undefined>,
    categories: Category[] = [],
  ): Promise<ApiResponse<ScanReceiptResponse>> {
    const ocrText = coerceString(body?.ocrText);
    const ocrLines = this.parseReceiptLines(body?.ocrLines);
    const ruleCandidate = this.parseRuleCandidate(body?.ruleCandidate);
    const hasExternalOcr = Boolean(ocrText || ocrLines.length);

    if (!hasExternalOcr && !file?.buffer) {
      throw new BadRequestException('Receipt image or OCR text is required.');
    }

    const rawText = ocrText || ocrLines.map((line) => line.text).join('\n');
    
    // If categories are not provided (e.g. from direct API call), try to fetch them if userId exists
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
      const result = await this.generateContent(
        prompt,
        hasExternalOcr ? undefined : file?.buffer,
        hasExternalOcr ? undefined : file?.mimetype,
        this.parseModel,
      );
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
      where: { user: { id: userId } },
      order: { id: 'ASC' },
    });
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
      };
    } catch (error) {
      this.logger.error('Parse category query failed', error);
      return {
        action: 'get_categories',
        name: null,
        type: 'expense',
        icon: null,
      };
    }
  }

  private async handleCategoryRequest(
    message: string,
    userId: number,
    goalId?: number,
  ): Promise<ApiResponse<string>> {
    const query = await this.parseCategoryQuery(message);

    if (query.action === 'get_categories') {
      const categories = await this.getCategories(userId, goalId);
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

      const newCat = this.categoryRepo.create({
        name: query.name,
        icon: query.icon ?? '📁',
        type: query.type as any,
        user,
      });

      const saved = await this.categoryRepo.save(newCat);
      const savedEntity = Array.isArray(saved) ? saved[0] : saved;

      return {
        success: true,
        statusCode: 200,
        message: `${MSG_PREFIX.CATEGORY_CREATED}${JSON.stringify({
          action: 'add_category',
          category: {
            id: savedEntity.id,
            name: savedEntity.name,
            icon: savedEntity.icon,
            type: savedEntity.type,
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

    if (ocrText) {
      return this.handleReceiptOcr(userId, ocrText, ocrLines);
    }

    const goalId = (await this.financialInsightsService.getSelectedGoalId(userId)) ?? 0;

    const lowerMessage = norm(message || '');
    const isAnalysisRequest =
      lowerMessage.includes('phan tich') ||
      lowerMessage.includes('ke hoach') ||
      lowerMessage.includes('ngan sach') ||
      lowerMessage.includes('khuyen');

    if (isAnalysisRequest) {
      return this.handleAnalysis(message ?? '', userId, goalId);
    }

    if (this.isCategoryRequest(message ?? '')) {
      return this.handleCategoryRequest(message ?? '', userId, goalId);
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
    }));

    if (!this.isLikelyTransactionMessage(message ?? '', categories)) {
      const answer = await this.chatAnswer(message ?? '');
      return { success: true, statusCode: 200, message: answer };
    }

    const walletOptions = wallets.map((w) => ({ id: w.id, name: w.name }));
    const parsedTrans = await this.parseTransaction(
      message ?? '', 
      options,
      walletOptions
    );

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

        // Resolve Wallet
        let walletId: number | undefined;
        let selectedWallet: Wallet | null = null;

        // 1. Priority: Explicitly mentioned wallet name
        if (parsedTrans.wallet_name) {
          walletId = this.findWalletIdByName(wallets, parsedTrans.wallet_name);
          if (walletId) {
            selectedWallet = wallets.find(w => w.id === walletId) || null;
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
          type: parsedTrans.type as 'income' | 'expense',
          amount,
          note: parsedTrans.description ?? 'Giao dịch từ chatbot',
          transactionDate: isValidDate(parsedTrans.time)
            ? new Date(parsedTrans.time!).toISOString()
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
6. category_name: CHỈ BẮT BUỘC chọn từ danh sách: [${options.map((o) => o.name).join(', ')}].
7. wallet_name: Neu nguoi dung co nhac den ten vi (vd: "vi ATM", "tien mat", "Momo"), hay trich xuat ten vi do tu danh sach: [${wallets.map((w) => w.name).join(', ')}]. Neu khong nhac den, tra ve null.

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
                      wallet_name: {
                        type: Type.STRING,
                        description: 'Ten vi nguoi dung nhac den',
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
        wallet_name: args.wallet_name ?? null,
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
        wallet_name: null,
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
        (w) => norm(w.name).includes(normalized) || normalized.includes(norm(w.name)),
      );
    return match?.id;
  }

  private async handleReceiptOcr(
    userId: number,
    ocrText: string,
    ocrLines?: string,
  ): Promise<ApiResponse<string>> {
    try {
      const goalId = (await this.financialInsightsService.getSelectedGoalId(userId)) ?? 0;
      const categories = await this.getCategories(userId, goalId);
      const wallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });

      // 1. Scan receipt using Gemini
      const scanBody = { ocrText, ocrLines };
      const scanResult = await this.scanReceipt(undefined, scanBody, categories);

      if (!scanResult.success || !scanResult.data) {
        this.logger.warn(`[handleReceiptOcr] Scan failed: ${scanResult.message}`);
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
          message: 'Tôi đã đọc hóa đơn nhưng không tìm thấy số tiền hợp lệ. Bạn vui lòng kiểm tra lại ảnh nhé.',
        };
      }

      // 2. Automatic Categorization
      let pickedCategory = this.pickCategoryByName(
        categories,
        data.category_name || data.merchant_name,
        'expense',
      );

      if (data.category_name) {
        const aiMatch = categories.find(c => 
          norm(c.name).includes(norm(data.category_name)) || 
          norm(data.category_name).includes(norm(c.name))
        );
        if (aiMatch) pickedCategory = aiMatch;
      }

      if (!pickedCategory) {
        const fallback = await this.getFallbackCategoryFromDB(userId, 'expense');
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
        note: data.suggested_note || `Hóa đơn tại ${data.merchant_name || 'Cửa hàng'}`,
        transactionDate: data.date && isValidDate(data.date)
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
}
