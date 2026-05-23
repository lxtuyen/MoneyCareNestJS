import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';
import { getTodayIsoDate, normalizeIsoDate } from 'src/common/utils/date.util';
import { extractJsonObject, safeJsonParse } from 'src/common/utils/json.util';
import { coerceMoneyAmount } from 'src/common/utils/money.util';
import { coerceString } from 'src/common/utils/string.util';
import { Category } from 'src/modules/categories/entities/category.entity';
import {
  ReceiptOcrLine,
  ReceiptRuleCandidate,
  ScanReceiptModel,
  ScanReceiptResponse,
} from './types/receipt.types';
import { AiGeminiClientService } from './ai-gemini-client.service';

@Injectable()
export class ReceiptOcrService {
  private readonly logger = new Logger(ReceiptOcrService.name);

  constructor(
    private readonly geminiClient: AiGeminiClientService,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  private async generateContent(prompt: string) {
    return this.geminiClient.generateContent(
      prompt,
      undefined,
      undefined,
      this.geminiClient.parseModel,
    );
  }

  private async getCategoriesByUserId(userId: number): Promise<Category[]> {
    return this.categoryRepo.find({
      where: [{ user: { id: userId } }, { is_system: true }],
      relations: ['subCategories'],
      order: { is_system: 'DESC', id: 'ASC' },
    });
  }

  private async getCategories(userId: number): Promise<Category[]> {
    return this.getCategoriesByUserId(userId);
  }

  private parseReceiptLines(value: unknown): ReceiptOcrLine[] {
    const parsed = safeJsonParse<unknown>(value, []);
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
    const parsed = safeJsonParse<unknown>(value, {});
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
      totalAmount: coerceMoneyAmount(raw.totalAmount),
      currency: coerceString(raw.currency),
      confidence: Number.isFinite(Number(raw.confidence))
        ? Number(raw.confidence)
        : 0,
      warnings,
    };
  }

  private validateReceiptResult(
    raw: Record<string, unknown>,
    rawText: string,
    ruleCandidate: ReceiptRuleCandidate,
  ): ScanReceiptModel {
    const ruleTransactionDate = coerceString(ruleCandidate.transactionDate);
    const fallbackDate =
      normalizeIsoDate(ruleTransactionDate) ?? getTodayIsoDate();
    const date = normalizeIsoDate(raw.date) ?? fallbackDate;
    const parsedAmount = coerceMoneyAmount(raw.totalAmount);
    const ruleAmount = coerceMoneyAmount(ruleCandidate.totalAmount);

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
 5. date phai la YYYY-MM-DD. Neu khong co nam, hay lay nam hien tai (2026).
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
      const parsed = extractJsonObject(result.text || '');
      const data = this.toScanReceiptResponse(
        this.validateReceiptResult(parsed, rawText, ruleCandidate),
      );

      return ok(data, 'Scan receipt successfully');
    } catch (error) {
      this.logger.error('Scan receipt failed', error);
      const data = this.toScanReceiptResponse(
        this.validateReceiptResult({}, rawText, ruleCandidate),
      );
      return ok(data, 'Scan receipt fallback result');
    }
  }
}
