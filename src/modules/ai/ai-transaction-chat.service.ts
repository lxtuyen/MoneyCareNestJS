import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { normalizeAmount } from 'src/common/utils/money.util';
import { norm } from 'src/common/utils/string.util';
import { isValidDate } from 'src/common/utils/date.util';
import { ok } from 'src/common/utils/response.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import { TransactionFilterDto } from 'src/modules/transactions/dto/transaction-filter.dto';
import { AiGeminiClientService } from './ai-gemini-client.service';
import { AiAnalysisChatService } from './ai-analysis-chat.service';
import { ReceiptOcrService } from './receipt-ocr.service';
import { FinancialInsightsService } from './financial-insights.service';
import {
  LIKELY_TRANSACTION_KEYWORDS,
  GET_TRANSACTION_KEYWORDS,
} from './constants/ai-keywords.constants';
import {
  getQueryTransactionsPrompt,
  getQueryTransactionsTool,
  getRecordTransactionPrompt,
  getRecordTransactionTool,
  GeminiResponse,
} from './config/gemini-tools.config';
import {
  AiMessagePrefix,
  CatOption,
  ChatTransactionResult,
  GetTransactionQuery,
  MapTransactionInput,
} from './types/ai.types';

@Injectable()
export class AiTransactionChatService {
  private readonly logger = new Logger(AiTransactionChatService.name);

  constructor(
    private readonly transactionService: TransactionService,
    private readonly geminiClient: AiGeminiClientService,
    private readonly analysisChatService: AiAnalysisChatService,
    private readonly receiptOcrService: ReceiptOcrService,
    private readonly financialInsightsService: FinancialInsightsService,
    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  isGetTransactionRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    return GET_TRANSACTION_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
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

    const matchesKeyword = LIKELY_TRANSACTION_KEYWORDS.some((keyword) =>
      normalized.includes(keyword),
    );
    if (matchesKeyword) return true;

    const matchesCategory = categories.some((cat) =>
      normalized.includes(norm(cat.name)),
    );
    if (matchesCategory) return true;

    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    return words.length > 0 && words.length <= 6;
  }

  private mapToAiTransaction(t: MapTransactionInput) {
    return {
      id: t.id,
      amount: t.amount,
      type: t.type,
      note: t.note,
      date: t.transaction_date ?? t.transactionDate,
      walletId: t.walletId,
      category: t.category
        ? {
            id: t.category.id,
            name: t.category.name,
            icon: t.category.icon,
          }
        : null,
      subCategory: t.subCategory
        ? {
            id: t.subCategory.id,
            name: t.subCategory.name,
            icon: t.subCategory.icon,
          }
        : null,
    };
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

  private pickCategoryByName(
    categories: Category[],
    name: string | null,
    type: 'income' | 'expense',
  ): Category | undefined {
    const typeCategories = categories.filter(
      (c) => String(c.type) === type || String(c.type) === 'others',
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
        norm(category.name).includes('chua phan loai') ||
        norm(category.name).includes('chi phi phat sinh'),
    );
  }

  private async getFallbackCategoryFromDB(
    userId: number,
    type: 'income' | 'expense',
  ): Promise<Category | null> {
    const allCategories = await this.categoryRepo.find({
      where: [
        { user: { id: userId }, type: type as Category['type'] },
        { is_system: true, type: type as Category['type'] },
      ],
    });
    return (
      allCategories.find(
        (c) =>
          norm(c.name).includes('khac') ||
          norm(c.name).includes('chua phan loai') ||
          norm(c.name).includes('chi phi phat sinh'),
      ) || null
    );
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

  private async parseGetTransactionQuery(
    message: string,
  ): Promise<GetTransactionQuery> {
    try {
      const nowIso = new Date().toISOString();
      const prompt = getQueryTransactionsPrompt(message, nowIso);
      const toolConfig = getQueryTransactionsTool();

      const response = await this.geminiClient.generateToolContent(
        prompt,
        toolConfig,
      );

      const calls = (response as unknown as GeminiResponse).functionCalls;
      const args = calls?.[0]?.args as Record<
        string,
        string | number | null | undefined
      >;
      if (!args) throw new Error('Khong nhan duoc function call');

      return {
        type: (args.type as 'income' | 'expense' | 'all') ?? 'all',
        startDate: (args.startDate as string) ?? null,
        endDate: (args.endDate as string) ?? null,
        category_name: (args.category_name as string) ?? null,
        limit: (args.limit as number) ?? null,
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

  async handleGetTransactions(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    const query = await this.parseGetTransactionQuery(message);

    const filter: TransactionFilterDto = {
      userId,
      startDate: query.startDate ?? undefined,
      endDate: query.endDate ?? undefined,
      categoryName: query.category_name ?? undefined,
      limit: query.limit ?? undefined,
    };

    const result = await this.transactionService.findAllByFilter(filter);
    const { income, expense } = result.data ?? { income: [], expense: [] };

    let transactions: MapTransactionInput[] = [];
    if (query.type === 'income') {
      transactions = income;
    } else if (query.type === 'expense') {
      transactions = expense;
    } else {
      transactions = [
        ...income.map((t) => ({ ...t, type: 'income' as const })),
        ...expense.map((t) => ({ ...t, type: 'expense' as const })),
      ].sort(
        (a, b) =>
          new Date(b.transaction_date).getTime() -
          new Date(a.transaction_date).getTime(),
      );

      if (query.limit && query.limit > 0) {
        transactions = transactions.slice(0, query.limit);
      }
    }

    return {
      success: true,
      statusCode: 200,
      message: `${AiMessagePrefix.TRANSACTION_LIST}${JSON.stringify({
        query,
        transactions: transactions.map((t) => this.mapToAiTransaction(t)),
        total: transactions.length,
      })}`,
    };
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
      const nowIso = new Date().toISOString();
      const categoryListStr = options.map((o) => o.name).join(', ');
      const walletListStr = wallets.map((w) => w.name).join(', ');

      const prompt = getRecordTransactionPrompt(
        message,
        nowIso,
        categoryListStr,
        subCategoryRules,
        walletListStr,
      );
      const toolConfig = getRecordTransactionTool(options.map((o) => o.name));

      const response = await this.geminiClient.generateToolContent(
        prompt,
        toolConfig,
      );

      const calls = (response as unknown as GeminiResponse).functionCalls;
      const args = calls?.[0]?.args as Record<
        string,
        string | number | boolean | string[] | null | undefined
      >;
      if (!args) {
        throw new Error('Khong nhan duoc function call');
      }

      return {
        amount: (args.amount as number) ?? null,
        type: (args.type as 'income' | 'expense') ?? 'expense',
        category_name: (args.category_name as string) ?? 'Khac',
        sub_category_name: (args.sub_category_name as string) ?? null,
        description: (args.description as string) ?? message,
        time: (args.time as string) ?? null,
        wallet_name: (args.wallet_name as string) ?? null,
        confidence: args.amount ? 1.0 : 0.0,
        needs_clarification: args.needs_clarification === true,
        suggested_sub_categories: Array.isArray(args.suggested_sub_categories)
          ? args.suggested_sub_categories.filter(
              (item): item is string => typeof item === 'string',
            )
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

  async handleRecordOrChat(
    message: string,
    userId: number,
    goalId: number,
  ): Promise<ApiResponse<string>> {
    const wallets = await this.walletRepo.find({
      where: { user: { id: userId }, is_active: true },
    });

    const categories = await this.getCategoriesByUserId(userId);
    const options: CatOption[] = categories.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as CatOption['type'],
      subCategories: (c.subCategories ?? []).map((subCategory) => ({
        id: subCategory.id,
        name: subCategory.name,
        icon: subCategory.icon,
      })),
    }));

    if (!this.isLikelyTransactionMessage(message ?? '', categories)) {
      const answer = await this.analysisChatService.chatAnswer(message ?? '');
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
          message: `${AiMessagePrefix.TRANSACTION_SAVED}${JSON.stringify({
            amount,
            type: parsedTrans.type,
            category: pickedCategory?.name ?? 'Hóa đơn',
            categoryIcon: pickedCategory?.icon ?? '',
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

        let walletId: number | undefined;
        let selectedWallet: Wallet | null = null;

        if (parsedTrans.wallet_name) {
          walletId = this.findWalletIdByName(wallets, parsedTrans.wallet_name);
          if (walletId) {
            selectedWallet = wallets.find((w) => w.id === walletId) || null;
          }
        }

        // Don't use saving goal wallet, prefer "Ví 1" or first non-saving wallet
        if (!walletId && wallets.length > 0) {
          // Get wallets with savingGoals relation to identify saving wallets
          const walletsWithGoals = await this.walletRepo.find({
            where: { user: { id: userId }, is_active: true },
            relations: ['savingGoals'],
          });

          // Try to find "Ví 1" first
          selectedWallet = walletsWithGoals.find(
            (w) => w.name === 'Ví 1' && (!w.savingGoals || w.savingGoals.length === 0),
          ) || null;

          // Fallback to first non-saving wallet
          if (!selectedWallet) {
            selectedWallet = walletsWithGoals.find(
              (w) => !w.savingGoals || w.savingGoals.length === 0,
            ) || walletsWithGoals[0];
          }

          walletId = selectedWallet?.id;
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
        const createdResult = await this.transactionService.create(dto);
        const createdTransaction = createdResult.data;

        return {
          success: true,
          statusCode: 200,
          message: `${AiMessagePrefix.TRANSACTION_SAVED}${JSON.stringify({
            ...this.mapToAiTransaction({
              ...dto,
              id: createdTransaction?.id,
              category: {
                id: pickedCategory?.id,
                name: pickedCategory?.name,
                icon: pickedCategory?.icon,
              },
              subCategory: pickedSubCategory
                ? {
                    id: pickedSubCategory.id,
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

    const answer = await this.analysisChatService.chatAnswer(message ?? '');
    return { success: true, statusCode: 200, message: answer };
  }

  async handleReceiptOcr(
    userId: number,
    ocrText: string,
    ocrLines?: string,
  ): Promise<ApiResponse<string>> {
    try {
      const goalId =
        (await this.financialInsightsService.getSelectedGoalId(userId)) ?? 0;
      const categories = await this.getCategoriesByUserId(userId);
      const wallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });

      const scanResult = await this.receiptOcrService.scanReceipt(
        { ocrText, ocrLines },
        categories,
      );

      if (!scanResult.success || !scanResult.data) {
        throw new BadRequestException(
          'Không thể xử lý hóa đơn này. Vui lòng thử lại.',
        );
      }

      const data = scanResult.data;

      let walletId: number | undefined;
      let selectedWallet: Wallet | null = null;

      // Don't use saving goal wallet, prefer "Ví 1" or first non-saving wallet
      if (wallets.length > 0) {
        // Get wallets with savingGoals relation to identify saving wallets
        const walletsWithGoals = await this.walletRepo.find({
          where: { user: { id: userId }, is_active: true },
          relations: ['savingGoals'],
        });

        // Try to find "Ví 1" first
        selectedWallet = walletsWithGoals.find(
          (w) => w.name === 'Ví 1' && (!w.savingGoals || w.savingGoals.length === 0),
        ) || null;

        // Fallback to first non-saving wallet
        if (!selectedWallet) {
          selectedWallet = walletsWithGoals.find(
            (w) => !w.savingGoals || w.savingGoals.length === 0,
          ) || walletsWithGoals[0];
        }

        walletId = selectedWallet?.id;
      }

      const transactionDateStr =
        data.date && isValidDate(data.date)
          ? new Date(data.date).toISOString()
          : new Date().toISOString();

      // Check if we extracted receipt items
      if (data.items && data.items.length > 0) {
        const savedTransactions: any[] = [];

        for (const item of data.items) {
          let itemCategory = this.pickCategoryByName(
            categories,
            item.category_name,
            'expense',
          );

          if (item.category_name) {
            const aiMatch = categories.find(
              (c) =>
                norm(c.name).includes(norm(item.category_name)) ||
                norm(item.category_name).includes(norm(c.name)),
            );
            if (aiMatch) itemCategory = aiMatch;
          }

          if (!itemCategory) {
            const fallback = await this.getFallbackCategoryFromDB(
              userId,
              'expense',
            );
            if (fallback) itemCategory = fallback;
          }

          const itemAmount = item.amount || item.price * item.quantity;

          const isMerchantPlaceholder =
            !data.merchant_name ||
            ['cua hang', 'cửa hàng', 'placeholder'].includes(
              data.merchant_name.trim().toLowerCase(),
            );

          const dto: CreateTransactionDto = {
            userId,
            type: 'expense',
            amount: itemAmount,
            note: isMerchantPlaceholder
              ? `${item.name} (x${item.quantity})`
              : `${data.merchant_name} - ${item.name} (x${item.quantity})`,
            transactionDate: transactionDateStr,
            categoryId: itemCategory?.id,
            walletId: walletId,
          };

          const createdResult = await this.transactionService.create(dto);
          const createdTransaction = createdResult.data;

          const mapped = {
            ...this.mapToAiTransaction({
              ...dto,
              id: createdTransaction?.id,
              category: {
                id: itemCategory?.id,
                name: itemCategory?.name,
                icon: itemCategory?.icon,
              },
            }),
            walletName: selectedWallet?.name,
            note: dto.note,
            isAutoFromReceipt: true,
          };
          savedTransactions.push(mapped);
        }

        if (savedTransactions.length > 0) {
          return ok(
            '',
            `${AiMessagePrefix.TRANSACTION_LIST}${JSON.stringify({
              query: {
                type: 'expense',
                startDate: data.date,
                endDate: data.date,
              },
              transactions: savedTransactions,
              total: savedTransactions.length,
            })}`,
          );
        }
      }

      // Fallback to saving a single transaction if no items were extracted or saved
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
        return ok(
          '',
          'Tôi đã đọc hóa đơn nhưng không tìm thấy số tiền hợp lệ. Bạn vui lòng kiểm tra lại ảnh nhé.',
        );
      }

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

      const dto: CreateTransactionDto = {
        userId,
        type: 'expense',
        amount,
        note:
          data.suggested_note ||
          `Hóa đơn tại ${data.merchant_name || 'Cửa hàng'}`,
        transactionDate: transactionDateStr,
        categoryId: pickedCategory?.id,
        walletId: walletId,
      };

      const createdResult = await this.transactionService.create(dto);
      const createdTransaction = createdResult.data;

      return ok(
        '',
        `${AiMessagePrefix.TRANSACTION_SAVED}${JSON.stringify({
          ...this.mapToAiTransaction({
            ...dto,
            id: createdTransaction?.id,
            category: {
              id: pickedCategory?.id,
              name: pickedCategory?.name,
              icon: pickedCategory?.icon,
            },
          }),
          walletName: selectedWallet?.name,
          note: dto.note,
          isAutoFromReceipt: true,
        })}`,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `Có lỗi xảy ra khi tự động lưu hóa đơn: ${errorMessage}`,
      );
    }
  }
}
