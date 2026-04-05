import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FundType, Fund } from './entities/fund.entity';
import { UpdateFundDto } from './dto/update-fund.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateFundDto } from './dto/create-fund.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { FundResponseDto } from './dto/fund-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class FundsService {
  constructor(
    @InjectRepository(Fund)
    private readonly fundRepo: Repository<Fund>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,

    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // CRUD
  // ────────────────────────────────────────────────────────────────────────────

  async create(
    dto: CreateFundDto,
    userId?: number,
  ): Promise<ApiResponse<FundResponseDto>> {
    const ownerId = userId ?? dto.userId;
    const user = await this.userRepo.findOne({ where: { id: ownerId } });
    if (!user) throw new NotFoundException('User not found');

    const fund = this.fundRepo.create({
      name: dto.name,
      user,
      type: dto.type ?? FundType.SPENDING,
      balance: dto.balance ?? 0,
      monthly_limit: dto.monthly_limit ?? null,
      target: dto.target ?? null,
      saved_amount: dto.saved_amount ?? 0,
      template_key: dto.template_key ?? null,
      start_date: dto.start_date ?? null,
      end_date: dto.end_date ?? null,
    } as Partial<Fund>);

    const savedFund = await this.fundRepo.save(fund);

    if (dto.categories?.length) {
      const categories = dto.categories.map((cat) =>
        this.categoryRepo.create({
          ...cat,
          fund: savedFund,
        } as Partial<Category>),
      );
      await this.categoryRepo.save(categories);
    }

    const result = await this.fundRepo.findOne({
      where: { id: savedFund.id },
      relations: ['categories'],
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: plainToInstance(FundResponseDto, result),
    });
  }

  async findAllByUser(userId: number): Promise<ApiResponse<Fund[]>> {
    const funds = await this.fundRepo.find({
      where: { user: { id: userId } },
      relations: ['categories'],
      order: { created_at: 'DESC' },
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: funds,
    });
  }

  /** List only SPENDING funds for a user. */
  async findSpendingFunds(
    userId: number,
  ): Promise<ApiResponse<Fund[]>> {
    const funds = await this.fundRepo.find({
      where: { user: { id: userId }, type: FundType.SPENDING },
      relations: ['categories'],
      order: { created_at: 'DESC' },
    });
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: funds });
  }

  /** List only SAVING_GOAL funds for a user. */
  async findGoalFunds(userId: number): Promise<ApiResponse<Fund[]>> {
    const funds = await this.fundRepo.find({
      where: { user: { id: userId }, type: FundType.SAVING_GOAL },
      relations: [],
      order: { created_at: 'DESC' },
    });

    // Attach computed fields for each goal
    const enriched = funds.map((f) => this.enrichGoal(f));
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: enriched });
  }

  async findOne(id: number, userId?: number): Promise<ApiResponse<Fund>> {
    const fund = await this.fundRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['categories'],
    });
    if (!fund) throw new NotFoundException('Saving fund not found');
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: fund });
  }

  async update(
    id: number,
    dto: UpdateFundDto,
    userId?: number,
  ): Promise<ApiResponse<Fund>> {
    const fund = await this.fundRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['categories'],
    });
    if (!fund) throw new NotFoundException('Saving fund not found');

    // Apply all optional fields
    if (dto.name !== undefined) fund.name = dto.name;
    if (dto.type !== undefined) fund.type = dto.type;
    if (dto.is_selected !== undefined) fund.is_selected = dto.is_selected;
    if (dto.balance !== undefined) fund.balance = dto.balance;
    if (dto.monthly_limit !== undefined) fund.monthly_limit = dto.monthly_limit;
    if (dto.spent_current_month !== undefined) fund.spent_current_month = dto.spent_current_month;
    if (dto.notified_70 !== undefined) fund.notified_70 = dto.notified_70;
    if (dto.notified_90 !== undefined) fund.notified_90 = dto.notified_90;
    if (dto.target !== undefined) fund.target = dto.target;
    if (dto.saved_amount !== undefined) fund.saved_amount = dto.saved_amount;
    if (dto.template_key !== undefined) fund.template_key = dto.template_key;
    if (dto.start_date !== undefined) fund.start_date = dto.start_date;
    if (dto.end_date !== undefined) fund.end_date = dto.end_date;

    // Auto-detect goal completion
    if (fund.type === FundType.SAVING_GOAL) {
      fund.is_completed = this.detectGoalCompletion(fund);
    }
    // Manual override
    if (dto.is_completed !== undefined) fund.is_completed = dto.is_completed;

    if (dto.categories) {
      const categoryPromises = dto.categories.map((catDto) => {
        if (catDto.id) {
          return this.categoryRepo.update(catDto.id, {
            name: catDto.name,
            icon: catDto.icon,
            percentage: catDto.percentage,
          });
        }
        const newCat = this.categoryRepo.create({ ...catDto, fund: fund });
        return this.categoryRepo.save(newCat);
      });
      await Promise.all(categoryPromises);
      fund.categories = await this.categoryRepo.find({
        where: { fund: { id: fund.id } },
      });
    }

    const updated = await this.fundRepo.save(fund);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: updated });
  }

  private async findOneEntity(id: number, userId?: number): Promise<Fund> {
    const fund = await this.fundRepo.findOne({
      where: userId ? { id, user: { id: userId } } : { id },
      relations: ['categories'],
    });
    if (!fund) throw new NotFoundException('Saving fund not found');
    return fund;
  }

  async remove(id: number, userId?: number): Promise<ApiResponse<string>> {
    const fund = await this.findOneEntity(id, userId);
    await this.fundRepo.remove(fund);
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

  async selectFund(
    userId: number,
    fundId: number,
  ): Promise<ApiResponse<Fund>> {
    const fund = await this.fundRepo.findOne({
      where: { id: fundId, user: { id: userId } },
      relations: ['categories'],
    });
    if (!fund) throw new NotFoundException('Saving fund not found');

    await this.fundRepo.update(
      { user: { id: userId }, type: FundType.SPENDING },
      { is_selected: false },
    );

    fund.is_selected = true;
    const updated = await this.fundRepo.save(fund);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: updated });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SAVINGS GOAL helpers (replaces GoalFundService)
  // ────────────────────────────────────────────────────────────────────────────

  /** Calculate progress % for a SAVING_GOAL fund (0–100). */
  calculateProgress(fund: Fund): number {
    const target = Number(fund.target);
    if (target <= 0) return 0;
    const percent = (Number(fund.saved_amount) / target) * 100;
    return Math.min(Math.round(percent * 100) / 100, 100);
  }

  /** Monthly savings needed to hit the target on time. */
  calculateMonthlySavingsNeeded(fund: Fund): number {
    if (!fund.end_date || !fund.target) return 0;
    const today = new Date();
    const target = new Date(fund.end_date);
    const monthsRemaining =
      (target.getFullYear() - today.getFullYear()) * 12 +
      (target.getMonth() - today.getMonth());
    if (monthsRemaining <= 0) return 0;
    const remaining = Number(fund.target) - Number(fund.saved_amount);
    if (remaining <= 0) return 0;
    return Math.ceil(remaining / monthsRemaining);
  }

  private detectGoalCompletion(fund: Fund): boolean {
    return Number(fund.saved_amount) >= Number(fund.target ?? 0);
  }

  /** Enrich a SAVING_GOAL fund with computed fields. */
  private enrichGoal(fund: Fund): Fund & {
    progress_percent: number;
    monthly_savings_needed: number;
  } {
    return {
      ...fund,
      progress_percent: this.calculateProgress(fund),
      monthly_savings_needed: this.calculateMonthlySavingsNeeded(fund),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // BUDGET helpers (replaces BudgetService)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Called after each EXPENSE transaction.
   * Updates spent_current_month and fires notification flags if thresholds exceeded.
   */
  async updateMonthlySpending(
    fundId: number,
    newSpentAmount: number,
  ): Promise<void> {
    const fund = await this.fundRepo.findOne({ where: { id: fundId } });
    if (!fund || fund.type !== FundType.SPENDING) return;

    fund.spent_current_month = newSpentAmount;

    if (fund.monthly_limit && fund.monthly_limit > 0) {
      const percent = (newSpentAmount / Number(fund.monthly_limit)) * 100;
      if (percent >= 70 && !fund.notified_70) fund.notified_70 = true;
      if (percent >= 90 && !fund.notified_90) fund.notified_90 = true;
    }

    await this.fundRepo.save(fund);
  }

  /** Reset monthly counters — called by the scheduler on the 1st of each month. */
  async resetMonthlyCounters(): Promise<void> {
    await this.fundRepo
      .createQueryBuilder()
      .update(Fund)
      .set({ spent_current_month: 0, notified_70: false, notified_90: false })
      .where('type = :type', { type: FundType.SPENDING })
      .execute();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // EXPIRED FUND HANDLING (unchanged)
  // ────────────────────────────────────────────────────────────────────────────

  async checkExpiredFund(userId: number) {
    const expiredFund = await this.fundRepo
      .createQueryBuilder('fund')
      .leftJoinAndSelect('fund.categories', 'categories')
      .leftJoin('categories.transactions', 'transactions')
      .where('fund.user.id = :userId', { userId })
      .andWhere('fund.status = :status', { status: 'EXPIRED' })
      .andWhere('fund.completion_notified = :notified', { notified: false })
      .select([
        'fund.id',
        'fund.name',
        'fund.end_date',
        'fund.balance',
        'fund.target',
        'categories.id',
        'transactions.id',
        'transactions.amount',
        'transactions.type',
      ])
      .getOne();

    if (!expiredFund) {
      return new ApiResponse({
        success: true,
        statusCode: HttpStatus.OK,
        data: { has_expired_fund: false },
      });
    }

    let total_spent = 0;
    if (expiredFund.categories) {
      for (const category of expiredFund.categories) {
        if (category.transactions) {
          total_spent += category.transactions
            .filter((t) => t.type === 'expense')
            .reduce((sum, t) => sum + Number(t.amount), 0);
        }
      }
    }

    const completion_percentage = expiredFund.target
      ? Math.round((total_spent / Number(expiredFund.target)) * 100)
      : 0;

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        has_expired_fund: true,
        expired_fund: {
          id: expiredFund.id,
          name: expiredFund.name,
          end_date: expiredFund.end_date,
          completion_percentage,
          total_spent,
          target: expiredFund.target,
          balance: expiredFund.balance,
        },
      },
    });
  }

  async markAsNotified(fundId: number, userId?: number) {
    const fund = await this.fundRepo.findOne({
      where: userId ? { id: fundId, user: { id: userId } } : { id: fundId },
    });
    if (!fund) throw new NotFoundException('Saving fund not found');
    fund.completion_notified = true;
    await this.fundRepo.save(fund);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: 'Marked as notified' });
  }

  async extendFund(
    fundId: number,
    new_end_date: Date,
    new_start_date?: Date,
    userId?: number,
  ) {
    const fund = await this.fundRepo.findOne({
      where: userId ? { id: fundId, user: { id: userId } } : { id: fundId },
      relations: ['categories'],
    });
    if (!fund) throw new NotFoundException('Saving fund not found');

    fund.end_date = new_end_date;
    if (new_start_date) fund.start_date = new_start_date;
    fund.status = 'ACTIVE';
    fund.completion_notified = false;

    const updated = await this.fundRepo.save(fund);
    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: updated });
  }

  async getFundReport(fundId: number, userId?: number) {
    const queryBuilder = this.fundRepo
      .createQueryBuilder('fund')
      .leftJoinAndSelect('fund.categories', 'categories')
      .leftJoinAndSelect('categories.transactions', 'transactions')
      .where('fund.id = :fundId', { fundId });

    if (userId) {
      queryBuilder.andWhere('fund.user.id = :userId', { userId });
    }

    const fund = await queryBuilder.getOne();
    if (!fund) throw new NotFoundException('Saving fund not found');

    let total_spent = 0;
    let total_transactions = 0;
    const category_breakdown: {
      category_id: number;
      category_name: string;
      total_spent: number;
      transaction_count: number;
      percentage: number;
    }[] = [];

    if (fund.categories) {
      for (const category of fund.categories) {
        let category_spent = 0;
        let category_transaction_count = 0;
        if (category.transactions) {
          const expenses = category.transactions.filter((t) => t.type === 'expense');
          category_spent = expenses.reduce((sum, t) => sum + Number(t.amount), 0);
          category_transaction_count = expenses.length;
          total_transactions += category_transaction_count;
        }
        total_spent += category_spent;
        category_breakdown.push({
          category_id: category.id,
          category_name: category.name,
          total_spent: category_spent,
          transaction_count: category_transaction_count,
          percentage: 0,
        });
      }
    }

    if (total_spent > 0 && category_breakdown.length > 0) {
      let remaining_percentage = 100;
      category_breakdown.sort((a, b) => b.total_spent - a.total_spent);
      for (let i = 0; i < category_breakdown.length; i++) {
        if (i === category_breakdown.length - 1) {
          category_breakdown[i].percentage = remaining_percentage;
        } else {
          const percentage = Math.round((category_breakdown[i].total_spent / total_spent) * 100);
          category_breakdown[i].percentage = percentage;
          remaining_percentage -= percentage;
        }
      }
    }

    const balance = Number(fund.balance);
    const target = Number(fund.target ?? 0);
    const monthly_limit = Number(fund.monthly_limit ?? 0);
    const remaining_balance = balance - total_spent;
    const balance_usage_percentage = balance > 0 ? Math.round((total_spent / balance) * 100) : 0;
    const monthly_limit_usage_percentage =
      monthly_limit > 0 ? Math.round((Number(fund.spent_current_month) / monthly_limit) * 100) : 0;
    const target_completion_percentage =
      target > 0
        ? fund.type === FundType.SAVING_GOAL
          ? Math.round((Number(fund.saved_amount) / target) * 100)
          : Math.round((total_spent / target) * 100)
        : 0;

    let duration_days = 0;
    let daily_average_spending = 0;
    if (fund.start_date && fund.end_date) {
      const start = new Date(fund.start_date);
      const end = new Date(fund.end_date);
      const now = new Date();
      const effectiveEnd = now < end ? now : end;
      if (effectiveEnd >= start) {
        duration_days = Math.ceil(
          (effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (duration_days > 0) daily_average_spending = total_spent / duration_days;
      }
    }

    const report = {
      fund_id: fund.id,
      fund_name: fund.name,
      fund_type: fund.type,
      start_date: fund.start_date,
      end_date: fund.end_date,
      status: fund.status,
      balance,
      target,
      monthly_limit,
      total_spent,
      remaining_balance,
      balance_usage_percentage,
      monthly_limit_usage_percentage,
      monthly_spent: Number(fund.spent_current_month),
      target_completion_percentage,
      is_over_balance: total_spent > balance,
      is_over_monthly_limit: monthly_limit > 0 && Number(fund.spent_current_month) > monthly_limit,
      is_target_achieved:
        fund.type === FundType.SAVING_GOAL
          ? fund.is_completed
          : target > 0 && total_spent >= target,
      category_breakdown,
      total_transactions,
      average_transaction_amount:
        total_transactions > 0 ? Math.round((total_spent / total_transactions) * 100) / 100 : 0,
      duration_days,
      daily_average_spending: Math.round(daily_average_spending * 100) / 100,
      // SAVING_GOAL specific
      saved_amount: Number(fund.saved_amount),
      progress_percent: this.calculateProgress(fund),
      monthly_savings_needed: this.calculateMonthlySavingsNeeded(fund),
      is_completed: fund.is_completed,
    };

    return new ApiResponse({ success: true, statusCode: HttpStatus.OK, data: report });
  }

  async updateExpiredFundsStatus() {
    const now = new Date();
    const expiredFunds = await this.fundRepo
      .createQueryBuilder('fund')
      .where('fund.end_date <= :now', { now })
      .andWhere('fund.status = :status', { status: 'ACTIVE' })
      .getMany();

    if (expiredFunds.length > 0) {
      await this.fundRepo
        .createQueryBuilder()
        .update(Fund)
        .set({ status: 'EXPIRED' })
        .where('end_date <= :now', { now })
        .andWhere('status = :status', { status: 'ACTIVE' })
        .execute();

      console.log(`Updated ${expiredFunds.length} expired funds`);
    }

    return expiredFunds.length;
  }
}
