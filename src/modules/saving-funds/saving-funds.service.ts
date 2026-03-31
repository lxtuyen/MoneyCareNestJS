import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavingFund } from './entities/saving-fund.entity';
import { UpdateSavingFundDto } from './dto/update-saving-fund.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateSavingFundDto } from './dto/create-saving-fund.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingFundResponseDto } from './dto/saving-fund-response.dto';
import { plainToInstance } from 'class-transformer';
import { ApiResponse } from 'src/common/dto/api-response.dto';

@Injectable()
export class SavingFundsService {
  constructor(
    @InjectRepository(SavingFund)
    private readonly savingFundRepo: Repository<SavingFund>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,

    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
  ) {}

  async create(
    dto: CreateSavingFundDto,
  ): Promise<ApiResponse<SavingFundResponseDto>> {
    const user = await this.userRepo.findOne({
      where: { id: dto.userId },
    });
    if (!user) throw new NotFoundException('User not found');
    const fund = this.savingFundRepo.create({
      name: dto.name,
      user,
      budget: dto.budget ?? 0,
      target: dto.target ?? null,
      start_date: dto.start_date ?? null,
      end_date: dto.end_date ?? null,
    } as Partial<SavingFund>);

    const savedFund = await this.savingFundRepo.save(fund);
    if (dto.categories?.length) {
      const categories = dto.categories.map((cat) =>
        this.categoryRepo.create({
          ...cat,
          savingFund: savedFund,
        } as Partial<Category>),
      );

      await this.categoryRepo.save(categories);
    }

    const result = await this.savingFundRepo.findOne({
      where: { id: savedFund.id },
      relations: ['categories'],
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: plainToInstance(SavingFundResponseDto, result),
    });
  }

  async findAllByUser(userId: number): Promise<ApiResponse<SavingFund[]>> {
    const funds = await this.savingFundRepo.find({
      where: { user: { id: userId } },
      relations: ['categories'],
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: funds,
    });
  }

  async findOne(id: number): Promise<ApiResponse<SavingFund>> {
    const fund = await this.savingFundRepo.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: fund,
    });
  }

  async update(
    id: number,
    dto: UpdateSavingFundDto,
  ): Promise<ApiResponse<SavingFund>> {
    const fund = await this.savingFundRepo.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    fund.name = dto.name ?? fund.name;
    fund.is_selected = dto.is_selected ?? fund.is_selected;
    fund.budget = dto.budget ?? fund.budget;
    fund.target = dto.target ?? fund.target;
    fund.start_date = dto.start_date ?? fund.start_date;
    fund.end_date = dto.end_date ?? fund.end_date;

    if (dto.categories) {
      const categoryPromises = dto.categories.map((catDto) => {
        if (catDto.id) {
          return this.categoryRepo.update(catDto.id, {
            name: catDto.name,
            icon: catDto.icon,
            percentage: catDto.percentage,
          });
        }
        const newCat = this.categoryRepo.create({
          ...catDto,
          savingFund: fund,
        });
        return this.categoryRepo.save(newCat);
      });

      await Promise.all(categoryPromises);

      fund.categories = await this.categoryRepo.find({
        where: { savingFund: { id: fund.id } },
      });
    }

    const updated = await this.savingFundRepo.save(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  private async findOneEntity(id: number): Promise<SavingFund> {
    const fund = await this.savingFundRepo.findOne({
      where: { id },
      relations: ['categories'],
    });

    if (!fund) {
      throw new NotFoundException('Saving fund not found');
    }

    return fund;
  }

  async remove(id: number): Promise<ApiResponse<string>> {
    const fund = await this.findOneEntity(id);

    await this.savingFundRepo.remove(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

  async selectSavingFund(
    userId: number,
    fundId: number,
  ): Promise<ApiResponse<SavingFund>> {
    const fund = await this.savingFundRepo.findOne({
      where: { id: fundId, user: { id: userId } },
      relations: ['categories'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    await this.savingFundRepo.update(
      { user: { id: userId } },
      { is_selected: false },
    );

    fund.is_selected = true;
    const updated = await this.savingFundRepo.save(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  // ============ NEW METHODS FOR EXPIRED FUND HANDLING ============

  /**
   * Check if user has any expired fund that hasn't been notified
   */
  async checkExpiredFund(userId: number) {
    const expiredFund = await this.savingFundRepo
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
        'fund.budget',
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

    // Calculate total spent
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
          budget: expiredFund.budget,
        },
      },
    });
  }

  /**
   * Mark fund as notified to prevent showing popup again
   */
  async markAsNotified(fundId: number) {
    const fund = await this.savingFundRepo.findOne({
      where: { id: fundId },
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    fund.completion_notified = true;
    await this.savingFundRepo.save(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Marked as notified',
    });
  }

  /**
   * Extend the end date of a saving fund
   */
  async extendFund(fundId: number, new_end_date: Date, new_start_date?: Date) {
    const fund = await this.savingFundRepo.findOne({
      where: { id: fundId },
      relations: ['categories'],
    });

    if (!fund) throw new NotFoundException('Saving fund not found');

    fund.end_date = new_end_date;
    if (new_start_date) {
      fund.start_date = new_start_date;
    }
    fund.status = 'ACTIVE';
    fund.completion_notified = false;

    const updated = await this.savingFundRepo.save(fund);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: updated,
    });
  }

  /**
   * Get detailed report for a saving fund
   */
  async getFundReport(fundId: number, userId?: number) {
    const queryBuilder = this.savingFundRepo
      .createQueryBuilder('fund')
      .leftJoinAndSelect('fund.categories', 'categories')
      .leftJoinAndSelect('categories.transactions', 'transactions')
      .where('fund.id = :fundId', { fundId });

    // Add user validation if userId is provided
    if (userId) {
      queryBuilder.andWhere('fund.user.id = :userId', { userId });
    }

    const fund = await queryBuilder.getOne();

    if (!fund) throw new NotFoundException('Saving fund not found');

    // Calculate metrics
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
          const expenses = category.transactions.filter(
            (t) => t.type === 'expense',
          );
          category_spent = expenses.reduce(
            (sum, t) => sum + Number(t.amount),
            0,
          );
          category_transaction_count = expenses.length;
          total_transactions += category_transaction_count;
        }

        total_spent += category_spent;

        category_breakdown.push({
          category_id: category.id,
          category_name: category.name,
          total_spent: category_spent,
          transaction_count: category_transaction_count,
          percentage: 0, // Will calculate after we have total
        });
      }
    }

    // Calculate percentages with proper rounding to ensure sum = 100%
    if (total_spent > 0 && category_breakdown.length > 0) {
      let remaining_percentage = 100;
      
      // Sort by total_spent descending to assign largest percentages first
      category_breakdown.sort((a, b) => b.total_spent - a.total_spent);
      
      for (let i = 0; i < category_breakdown.length; i++) {
        if (i === category_breakdown.length - 1) {
          // Last category gets remaining percentage
          category_breakdown[i].percentage = remaining_percentage;
        } else {
          const percentage = Math.round((category_breakdown[i].total_spent / total_spent) * 100);
          category_breakdown[i].percentage = percentage;
          remaining_percentage -= percentage;
        }
      }
    }

    const budget = Number(fund.budget);
    const target = Number(fund.target);
    const remaining_budget = budget - total_spent;
    const budget_usage_percentage =
      budget > 0 ? Math.round((total_spent / budget) * 100) : 0;
    const target_completion_percentage =
      target > 0 ? Math.round((total_spent / target) * 100) : 0;

    // Calculate duration - only if both dates exist
    let duration_days = 0;
    let daily_average_spending = 0;
    
    if (fund.start_date && fund.end_date) {
      const start = new Date(fund.start_date);
      const end = new Date(fund.end_date);
      const now = new Date();
      
      // Calculate actual duration (from start to now or end, whichever is earlier)
      const effectiveEnd = now < end ? now : end;
      
      if (effectiveEnd >= start) {
        duration_days = Math.ceil(
          (effectiveEnd.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
        );
        
        // Only calculate daily average if we have actual days passed
        if (duration_days > 0) {
          daily_average_spending = total_spent / duration_days;
        }
      }
    }

    const report = {
      fund_id: fund.id,
      fund_name: fund.name,
      start_date: fund.start_date,
      end_date: fund.end_date,
      status: fund.status,
      budget,
      target,
      total_spent,
      remaining_budget,
      budget_usage_percentage,
      target_completion_percentage,
      is_over_budget: total_spent > budget,
      is_target_achieved: target > 0 && total_spent >= target,
      category_breakdown,
      total_transactions,
      average_transaction_amount:
        total_transactions > 0 ? Math.round((total_spent / total_transactions) * 100) / 100 : 0,
      duration_days,
      daily_average_spending: Math.round(daily_average_spending * 100) / 100,
    };

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: report,
    });
  }

  /**
   * Update status of expired funds (called by scheduled job)
   */
  async updateExpiredFundsStatus() {
    const now = new Date();

    const expiredFunds = await this.savingFundRepo
      .createQueryBuilder('fund')
      .where('fund.end_date <= :now', { now })
      .andWhere('fund.status = :status', { status: 'ACTIVE' })
      .getMany();

    if (expiredFunds.length > 0) {
      await this.savingFundRepo
        .createQueryBuilder()
        .update(SavingFund)
        .set({ status: 'EXPIRED' })
        .where('end_date <= :now', { now })
        .andWhere('status = :status', { status: 'ACTIVE' })
        .execute();

      console.log(`Updated ${expiredFunds.length} expired funds`);
    }

    return expiredFunds.length;
  }
}
