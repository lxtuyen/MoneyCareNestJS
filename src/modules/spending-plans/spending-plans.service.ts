import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { created, ok } from 'src/common/utils/response.util';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateSpendingPlanDto } from './dto/create-spending-plan.dto';
import { UpdateSpendingPlanDto } from './dto/update-spending-plan.dto';
import { CreateEstimatedExpenseDto } from 'src/modules/estimated-expenses/dto/create-estimated-expense.dto';
import { EstimatedExpense } from 'src/modules/estimated-expenses/entities/estimated-expense.entity';
import { SpendingPlan } from './entities/spending-plan.entity';
import { SpendingPlanStatus } from './interfaces/spending-plan.enums';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import { SpendingPlanStatisticsService } from './spending-plan-statistics.service';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { getVietnamNow } from 'src/common/utils/date.util';
import { SpendingPlanFilters } from './interfaces/spending-plan.interface';

@Injectable()
export class SpendingPlansService {
  constructor(
    @InjectRepository(SpendingPlan)
    private readonly planRepo: Repository<SpendingPlan>,

    @InjectRepository(EstimatedExpense)
    private readonly estimatedExpenseRepo: Repository<EstimatedExpense>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,

    private readonly dataSource: DataSource,
    private readonly calculator: SpendingPlanCalculatorService,
    private readonly statisticsService: SpendingPlanStatisticsService,
  ) {}

  async create(userId: number, dto: CreateSpendingPlanDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const estimatedExpenses: EstimatedExpense[] = [];
    for (const expense of dto.estimatedExpenses ?? []) {
      estimatedExpenses.push(
        await this.createEstimatedExpenseEntity(expense, user),
      );
    }
    const period = this.getCurrentPeriod();

    const calculation = this.calculator.calculate({
      totalAmount: dto.totalAmount,
      estimatedExpenses,
      month: period.month,
      year: period.year,
    });

    const plan = this.planRepo.create({
      totalAmount: dto.totalAmount,
      status: SpendingPlanStatus.DRAFT,
      estimatedExpenses,
      user,
      ...calculation,
    });

    estimatedExpenses.forEach((expense) => {
      expense.spendingPlan = plan;
    });

    const saved = await this.planRepo.save(plan);
    const reloaded = await this.loadPlanForUser(saved.id, userId);
    return created(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async findAll(userId: number, filters: SpendingPlanFilters) {
    const where: FindOptionsWhere<SpendingPlan> = { user: { id: userId } };
    if (filters.status) where.status = filters.status;

    const plans = await this.planRepo.find({
      where,
      relations: ['estimatedExpenses'],
      order: { createdAt: 'DESC' },
    });
    plans.forEach((plan) => this.applyCalculation(plan));
    const enrichedPlans = await Promise.all(
      plans.map((plan) => this.enrichPlanUsageForResponse(plan, userId)),
    );

    return ok(enrichedPlans);
  }

  async findOne(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    return ok(await this.enrichPlanUsageForResponse(plan, userId));
  }

  async findActive(userId: number) {
    const plan = await this.planRepo.findOne({
      where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      relations: ['estimatedExpenses'],
      order: { updatedAt: 'DESC' },
    });
    if (plan) {
      this.applyCalculation(plan);
    }

    return ok(
      plan ? await this.enrichPlanUsageForResponse(plan, userId) : null,
    );
  }

  async update(id: number, userId: number, dto: UpdateSpendingPlanDto) {
    const plan = await this.loadPlanForUser(id, userId);

    if (dto.totalAmount !== undefined) plan.totalAmount = dto.totalAmount;

    if (dto.estimatedExpenses !== undefined) {
      if (plan.estimatedExpenses?.length) {
        await this.estimatedExpenseRepo.remove(plan.estimatedExpenses);
      }

      plan.estimatedExpenses = [];
      for (const expense of dto.estimatedExpenses) {
        plan.estimatedExpenses.push(
          await this.createEstimatedExpenseEntity(expense, plan.user, plan),
        );
      }
    }

    this.applyCalculation(plan);
    await this.planRepo.save(plan);
    const reloaded = await this.loadPlanForUser(id, userId);
    return ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async activate(id: number, userId: number) {
    const activated = await this.dataSource.transaction(async (manager) => {
      const plan = await manager.findOne(SpendingPlan, {
        where: { id, user: { id: userId } },
        relations: ['estimatedExpenses', 'user'],
      });
      if (!plan) {
        throw new NotFoundException('Spending plan not found');
      }

      const activePlans = await manager.find(SpendingPlan, {
        where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      });

      for (const activePlan of activePlans) {
        if (activePlan.id !== plan.id) {
          activePlan.status = SpendingPlanStatus.PAUSED;
          await manager.save(activePlan);
        }
      }

      plan.status = SpendingPlanStatus.ACTIVE;
      return manager.save(plan);
    });

    const reloaded = await this.loadPlanForUser(activated.id, userId);
    return ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async pause(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    if (
      plan.status !== SpendingPlanStatus.ACTIVE &&
      plan.status !== SpendingPlanStatus.PAUSED
    ) {
      throw new BadRequestException('Only active spending plan can be paused');
    }

    if (plan.status !== SpendingPlanStatus.PAUSED) {
      plan.status = SpendingPlanStatus.PAUSED;
      await this.planRepo.save(plan);
    }

    return ok(await this.enrichPlanUsageForResponse(plan, userId));
  }

  async remove(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    await this.planRepo.remove(plan);
    return ok({ id });
  }

  async getActiveStatistics(userId: number) {
    return this.statisticsService.getActiveStatistics(userId);
  }

  async buildExpenseContext(
    plan: SpendingPlan,
    userId: number,
    period?: { month: number; year: number },
  ) {
    return this.statisticsService.buildExpenseContext(plan, userId, period);
  }

  public async recalculateAndReload(planId: number, userId: number) {
    const plan = await this.loadPlanForUser(planId, userId);
    this.applyCalculation(plan);
    await this.planRepo.save(plan);
    return this.loadPlanForUser(planId, userId);
  }

  public async enrichPlanUsageForResponse(plan: SpendingPlan, userId: number) {
    const context = await this.statisticsService.buildExpenseContext(
      plan,
      userId,
      {
        ...this.getCurrentPeriod(),
      },
    );

    return {
      ...plan,
      fixedExpenses: context.planItems,
    };
  }

  private async resolvePlanItemCategories(dto: {
    category?: string | null;
    categoryId?: number | null;
    subCategoryId?: number | null;
  }) {
    let category: Category | null = null;
    if (dto.categoryId) {
      category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
    } else if (dto.category) {
      category = await this.categoryRepo.findOne({
        where: { name: dto.category },
      });
    }

    let subCategory: SubCategory | null = null;
    if (dto.subCategoryId) {
      subCategory = await this.subCategoryRepo.findOne({
        where: { id: dto.subCategoryId },
        relations: ['category'],
      });
      if (!subCategory) throw new NotFoundException('Sub category not found');
      if (category && subCategory.category?.id !== category.id) {
        throw new BadRequestException(
          'Sub category does not belong to category',
        );
      }
      category = category ?? subCategory.category;
    }

    return { category, subCategory };
  }

  private applyCalculation(plan: SpendingPlan) {
    const calculation = this.calculator.calculate({
      totalAmount: plan.totalAmount,
      estimatedExpenses: plan.estimatedExpenses ?? [],
      ...this.getCurrentPeriod(),
    });

    Object.assign(plan, calculation);
  }

  public async loadPlanForUser(id: number, userId: number) {
    const plan = await this.planRepo.findOne({
      where: { id, user: { id: userId } },
      relations: ['estimatedExpenses', 'user'],
      order: { estimatedExpenses: { createdAt: 'ASC' } },
    });
    if (!plan) {
      throw new NotFoundException('Spending plan not found');
    }
    this.applyCalculation(plan);

    return plan;
  }

  private getCurrentPeriod() {
    const now = getVietnamNow();
    return {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };
  }

  async getMonthlySavingCapacity(userId: number) {
    return this.statisticsService.getMonthlySavingCapacity(userId);
  }

  private async createEstimatedExpenseEntity(
    dto: CreateEstimatedExpenseDto,
    user: User,
    plan?: SpendingPlan,
  ): Promise<EstimatedExpense> {
    const { category, subCategory } = await this.resolvePlanItemCategories(dto);
    return this.estimatedExpenseRepo.create({
      category,
      subCategory,
      amount: dto.amount,
      monthlyLimit: dto.monthlyLimit ?? dto.amount,
      dailyLimit: dto.dailyLimit ?? null,
      frequencyType: dto.frequencyType,
      frequencyValue: dto.frequencyValue,
      user,
      spendingPlan: plan,
    });
  }
}
