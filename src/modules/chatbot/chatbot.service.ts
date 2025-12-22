import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatOption } from './chatbot.types';
import { CreateTransactionDto } from 'src/modules/transactions/dto/create-transaction.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SavingFund } from 'src/modules/saving-funds/entities/saving-fund.entity';
import { AiGeminiChatbotService } from './ai-chatbot-gemini.service';
import { TransactionService } from 'src/modules/transactions/transactions.service';
import { ApiResponse } from 'src/common/dto/api-response.dto';

function isAddExpense(text: string) {
  return text.trim().toLowerCase().startsWith('thêm chi tiêu');
}

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
    private readonly gemini: AiGeminiChatbotService,
    private readonly transactionService: TransactionService,

    @InjectRepository(SavingFund)
    private readonly savingFundRepo: Repository<SavingFund>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}
  private async getSelectedFund(userId: number): Promise<SavingFund | null> {
    const fund = await this.savingFundRepo.findOne({
      where: {
        user: { id: userId },
        is_selected: true,
      },
      order: { updated_at: 'DESC' },
      relations: ['user'],
    });
    return fund;
  }

  private async getCategoriesByFundId(
    fundId: number,
  ): Promise<Category[] | null> {
    return this.categoryRepo.find({
      where: { savingFund: { id: fundId } },
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

  async handle(message: string, userIdRaw: any): Promise<ApiResponse<string>> {
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('userId phải là number');
    }

    if (isAddExpense(message)) {
      const fund = await this.getSelectedFund(userId);
      if (!fund) {
        return {
          success: false,
          statusCode: 400,
          message: 'Bạn chưa chọn quỹ.',
        };
      }

      const cats = await this.getCategoriesByFundId(fund.id);
      if (!cats || cats.length === 0) {
        return {
          success: false,
          statusCode: 404,
          message: 'Quỹ đang chọn chưa có category.',
        };
      }

      const options: CatOption[] = cats.map((c) => ({
        id: c.id,
        name: c.name,
      }));

      const out = await this.gemini.parseExpense(message, options);

      const amount = normalizeAmount(out.amount);
      if (!amount) {
        return {
          success: false,
          statusCode: 400,
          message: 'Thiếu số tiền. Ví dụ: "thêm chi tiêu mua bánh mì 20k".',
        };
      }

      const picked = this.pickCategoryByName(cats, out.category_name);
      if (!picked) {
        return {
          success: false,
          statusCode: 404,
          message: 'Không tìm thấy category phù hợp để lưu.',
        };
      }

      const dto: CreateTransactionDto = {
        userId,
        type: 'expense',
        amount,
        note: out.description ?? 'Chi tiêu',
        transactionDate: out.time || new Date().toISOString(),
        categoryId: picked.id,
      };

      await this.transactionService.create(dto);

      return {
        success: true,
        statusCode: 200,
        message: `Đã thêm ${amount.toLocaleString('vi-VN')} VND vào ${picked.name}`,
      };
    }

    const answer = await this.gemini.chatAnswer(message);
    return {
      success: true,
      statusCode: 200,
      message: answer,
    };
  }
}
