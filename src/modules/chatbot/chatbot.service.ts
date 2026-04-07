import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatOption } from './types/chatbot.types';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Fund } from 'src/modules/saving-funds/entities/fund.entity';
import { ChatbotAiService } from '../ai/chatbot-ai.service';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { ReceiptAiService } from '../ai/receipt-ai.service';

function normalizeAmount(amount: number | null): number | null {
  if (!amount || amount <= 0) return null;
  if (amount < 1000) return amount * 1000;
  return Math.round(amount);
}

function norm(s: string) {
  return (s || '').trim().toLowerCase();
}

@Injectable()
export class ChatbotService {
  constructor(
    private readonly gemini: ChatbotAiService,
    private readonly transactionService: TransactionService,

    @InjectRepository(Fund)
    private readonly fundRepo: Repository<Fund>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly receiptAi: ReceiptAiService,
  ) {}

  private async getSelectedFund(userId: number): Promise<Fund | null> {
    return this.fundRepo.findOne({
      where: { user: { id: userId }, is_selected: true },
      order: { updated_at: 'DESC' },
    });
  }

  private async getCategoriesByFundId(
    fundId: number,
  ): Promise<Category[] | null> {
    return this.categoryRepo.find({
      where: { fund: { id: fundId } },
      order: { id: 'ASC' },
    });
  }

  private pickCategoryByName(cats: Category[], geminiName: string | null) {
    const g = norm(geminiName || '');
    return (
      cats.find((c) => norm(c.name) === g) ||
      cats.find((c) => norm(c.name).includes(g) || g.includes(norm(c.name))) ||
      cats.find((c) => norm(c.name).includes('khác')) ||
      cats[0]
    );
  }

  async handle(
    message: string | undefined,
    userIdRaw: any,
    file?: Express.Multer.File,
  ): Promise<ApiResponse<string>> {
    const userId: number = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId phải là number');
    }

    // Handle File (Receipt Scan)
    if (file) {
      const fund = await this.getSelectedFund(userId);
      let categories: CatOption[] = [];
      if (fund) {
        const cats = await this.getCategoriesByFundId(fund.id);
        if (cats) {
          categories = cats.map((c) => ({ id: c.id, name: c.name }));
        }
      }

      const scanResult = await this.receiptAi.scan(file.buffer, categories);
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
      return this.handleAnalysis(message ?? '', userId);
    }

    // Try parsing as expense
    const fund = await this.getSelectedFund(userId);
    if (fund) {
      const cats = await this.getCategoriesByFundId(fund.id);
      if (cats && cats.length > 0) {
        const options: CatOption[] = cats.map((c) => ({
          id: c.id,
          name: c.name,
        }));
        const out = await this.gemini.parseExpense(message ?? '', options);

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
            return {
              success: true,
              statusCode: 200,
              message: `✅ Đã ghi nhận: ${amount.toLocaleString('vi-VN')} VND cho "${picked.name}".\n\n(Dựa trên tin nhắn: "${message ?? ''}")`,
            };
          }
        }
      }
    }

    // Fallback to general chat
    const answer = await this.gemini.chatAnswer(message ?? '');
    return {
      success: true,
      statusCode: 200,
      message: answer,
    };
  }

  private async handleAnalysis(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['profile'],
    });
    const fund = await this.getSelectedFund(userId);

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

    // Aggregate by category
    const categoryTotals: Record<string, number> = {};
    expenses.forEach((t) => {
      const catName = t.category?.name || 'Khác';
      categoryTotals[catName] =
        (categoryTotals[catName] || 0) + Number(t.amount);
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

      TỔNG THU NHẬP: ${income
        .reduce((sum, t) => sum + Number(t.amount || 0), 0)
        .toLocaleString('vi-VN')} VND

      DANH SÁCH QUỸ:
      ${funds
        .map(
          (f) =>
            `- ${f.name}: Số dư ${f.balance.toLocaleString('vi-VN')} VND (Mục tiêu: ${(f.target || 0).toLocaleString('vi-VN')} VND)`,
        )
        .join('\n')}
    `.trim();

    const options = (cats || []).map((c) => ({
      id: c.id,
      name: c.name,
    }));

    const userName = user?.profile
      ? `${user.profile.first_name || ''} ${user.profile.last_name || ''}`.trim()
      : 'Người dùng';

    const analysis = await this.gemini.analyzeFinancialHealth(
      message,
      options,
      historySummary,
      userName || 'Người dùng',
    );

    // If it's structured, we return it as a JSON string with a special prefix
    const resultString =
      typeof analysis === 'object'
        ? `__STRUCTURED_ANALYSIS__${JSON.stringify(analysis)}`
        : analysis;

    return {
      success: true,
      statusCode: 200,
      message: resultString,
    };
  }

  async bulkCreateTransactions(userId: number, items: any[]): Promise<void> {
    const fund = await this.getSelectedFund(userId);
    if (!fund) throw new BadRequestException('Chưa chọn quỹ để lưu giao dịch');

    const cats = await this.getCategoriesByFundId(fund.id);
    if (!cats || cats.length === 0)
      throw new BadRequestException('Quỹ không có hạng mục chi tiêu');

    const now = new Date().toISOString();

    for (const item of items) {
      const amount = normalizeAmount(item.amount);
      if (!amount || amount <= 0) continue;

      let categoryId = item.categoryId;
      if (!categoryId) {
        const picked = this.pickCategoryByName(cats, item.category);
        categoryId = picked.id;
      }

      const dto: CreateTransactionDto = {
        userId,
        type: 'expense',
        amount,
        note: item.name || 'Giao dịch từ hóa đơn',
        transactionDate: now,
        categoryId: categoryId,
      };

      await this.transactionService.create(dto);
    }
  }
}
