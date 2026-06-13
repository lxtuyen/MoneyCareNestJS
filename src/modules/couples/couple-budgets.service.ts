import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CoupleBudget } from './entities/couple-budget.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { CouplesService } from './couples.service';
import { SetCoupleBudgetDto } from './dto/couple-budget.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { getVietnamMonthRange } from 'src/common/utils/date.util';

@Injectable()
export class CoupleBudgetsService {
  constructor(
    @InjectRepository(CoupleBudget)
    private readonly coupleBudgetRepo: Repository<CoupleBudget>,
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly couplesService: CouplesService,
  ) {}

  private getMonthRange(monthStr: string) {
    const [year, month] = monthStr.split('-').map(Number);
    return getVietnamMonthRange(month, year);
  }

  private async getSpentAmount(
    coupleId: number,
    categoryId: number,
    month: string,
  ): Promise<number> {
    const { start, end } = this.getMonthRange(month);
    const raw = await this.transactionRepo
      .createQueryBuilder('transaction')
      .select('COALESCE(SUM(transaction.amount), 0)', 'spent')
      .where('transaction.coupleId = :coupleId', { coupleId })
      .andWhere('transaction.categoryId = :categoryId', { categoryId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.transaction_date >= :start', { start })
      .andWhere('transaction.transaction_date <= :end', { end })
      .getRawOne<{ spent: string | number }>();

    return Number(raw?.spent ?? 0);
  }

  private async mapBudgetResponse(budget: CoupleBudget): Promise<any> {
    const spentAmount = await this.getSpentAmount(
      budget.coupleId,
      budget.categoryId,
      budget.month,
    );
    const amount = Number(budget.amount);
    const remainingAmount = Math.max(0, amount - spentAmount);
    const usagePercentage = amount > 0 ? (spentAmount / amount) * 100 : 0;

    return {
      id: budget.id,
      coupleId: budget.coupleId,
      categoryId: budget.categoryId,
      categoryName: budget.category?.name ?? '',
      categoryIcon: budget.category?.icon ?? '💰',
      amount,
      month: budget.month,
      spentAmount,
      remainingAmount,
      usagePercentage,
    };
  }

  async setBudget(
    userId: number,
    dto: SetCoupleBudgetDto,
  ): Promise<ApiResponse<any>> {
    const activeCouple =
      await this.couplesService.getActiveCoupleForUser(userId);
    if (!activeCouple || activeCouple.id !== dto.coupleId) {
      throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
    }

    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Không tìm thấy danh mục chi tiêu.');
    }

    let budget = await this.coupleBudgetRepo.findOne({
      where: {
        coupleId: dto.coupleId,
        categoryId: dto.categoryId,
        month: dto.month,
      },
    });

    if (budget) {
      budget.amount = dto.amount;
    } else {
      budget = this.coupleBudgetRepo.create({
        coupleId: dto.coupleId,
        categoryId: dto.categoryId,
        amount: dto.amount,
        month: dto.month,
      });
    }

    const savedBudget = await this.coupleBudgetRepo.save(budget);
    savedBudget.category = category;
    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: await this.mapBudgetResponse(savedBudget),
      message: 'Thiết lập ngân sách thành công',
    });
  }

  async findAll(
    userId: number,
    coupleId: number,
    month: string,
  ): Promise<ApiResponse<any[]>> {
    const activeCouple =
      await this.couplesService.getActiveCoupleForUser(userId);
    if (!activeCouple || activeCouple.id !== coupleId) {
      throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
    }

    const budgets = await this.coupleBudgetRepo.find({
      where: { coupleId, month },
      relations: ['category'],
    });

    const resultList = await Promise.all(
      budgets.map((budget) => this.mapBudgetResponse(budget)),
    );

    return new ApiResponse({
      success: true,
      statusCode: 200,
      data: resultList,
    });
  }

  async deleteBudget(userId: number, id: number): Promise<ApiResponse<void>> {
    const budget = await this.coupleBudgetRepo.findOne({ where: { id } });
    if (!budget) {
      throw new NotFoundException('Không tìm thấy ngân sách.');
    }

    const activeCouple =
      await this.couplesService.getActiveCoupleForUser(userId);
    if (!activeCouple || activeCouple.id !== budget.coupleId) {
      throw new ForbiddenException(
        'Bạn không thuộc không gian cặp đôi của ngân sách này.',
      );
    }

    await this.coupleBudgetRepo.remove(budget);
    return new ApiResponse({
      success: true,
      statusCode: 200,
      message: 'Xóa ngân sách thành công',
    });
  }
}
