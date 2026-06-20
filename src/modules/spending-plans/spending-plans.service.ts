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
import { SpendingPlanStatus, SpendingPlanExpenseFrequency } from './interfaces/spending-plan.enums';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import { SpendingPlanStatisticsService } from './spending-plan-statistics.service';
import { Category, CategoryType } from 'src/modules/categories/entities/category.entity';
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

    const nextEstimatedExpenses: EstimatedExpense[] = [];
    if (dto.estimatedExpenses !== undefined) {
      for (const expense of dto.estimatedExpenses) {
        nextEstimatedExpenses.push(
          await this.createEstimatedExpenseEntity(expense, plan.user, plan),
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.totalAmount !== undefined) plan.totalAmount = dto.totalAmount;

      if (dto.estimatedExpenses !== undefined) {
        if (plan.estimatedExpenses?.length) {
          await manager.remove(EstimatedExpense, plan.estimatedExpenses);
        }

        plan.estimatedExpenses = nextEstimatedExpenses;
      }

      this.applyCalculation(plan);
      await manager.save(SpendingPlan, plan);
    });

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

  async getActiveStatistics(userId: number, month?: number, year?: number, startDay?: number) {
    return this.statisticsService.getActiveStatistics(userId, month, year, startDay);
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

  async syncSavingsBudget(
    userId: number,
    options: {
      savingGoalId?: number;
      coupleSavingGoalId?: number;
      name: string;
      target: number;
      startDate: Date;
      endDate: Date | null;
      isBudgetEnabled: boolean;
      status?: string;
    },
  ): Promise<void> {
    const isGoalCompleted = options.status === 'completed' || options.status === 'completed_early';
    const shouldAddBudget = options.isBudgetEnabled && !isGoalCompleted && options.target > 0 && options.endDate;

    const whereClause: any = {};
    if (options.savingGoalId) {
      whereClause.savingGoalId = options.savingGoalId;
    } else if (options.coupleSavingGoalId) {
      whereClause.coupleSavingGoalId = options.coupleSavingGoalId;
    } else {
      return;
    }

    const existingExpense = await this.estimatedExpenseRepo.findOne({
      where: whereClause,
      relations: ['spendingPlan'],
    });

    if (!shouldAddBudget) {
      if (existingExpense) {
        const planId = existingExpense.spendingPlan.id;
        await this.estimatedExpenseRepo.remove(existingExpense);
        await this.recalculateAndReload(planId, userId);
      }
      return;
    }

    const activePlan = await this.planRepo.findOne({
      where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      relations: ['estimatedExpenses'],
    });

    if (!activePlan) {
      if (existingExpense) {
        const planId = existingExpense.spendingPlan.id;
        await this.estimatedExpenseRepo.remove(existingExpense);
        await this.recalculateAndReload(planId, userId);
      }
      return;
    }

    const start = options.startDate ? new Date(options.startDate) : new Date();
    const end = options.endDate ? new Date(options.endDate) : new Date();
    let months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      end.getMonth() -
      start.getMonth() +
      1;
    if (months <= 0) months = 1;
    const monthlyAmount = Math.ceil(options.target / months);

    let savingCategory = await this.categoryRepo.findOne({
      where: { name: 'Tiết kiệm', type: CategoryType.EXPENSE },
    });
    if (!savingCategory) {
      savingCategory = this.categoryRepo.create({
        name: 'Tiết kiệm',
        icon: '🐷',
        type: CategoryType.EXPENSE,
        is_system: true,
      });
      savingCategory = await this.categoryRepo.save(savingCategory);
    }

    if (existingExpense) {
      const oldPlanId = existingExpense.spendingPlan.id;
      existingExpense.spendingPlan = activePlan;
      existingExpense.amount = monthlyAmount;
      existingExpense.monthlyLimit = monthlyAmount;
      existingExpense.category = savingCategory;
      await this.estimatedExpenseRepo.save(existingExpense);

      if (oldPlanId !== activePlan.id) {
        await this.recalculateAndReload(oldPlanId, userId);
      }
      await this.recalculateAndReload(activePlan.id, userId);
    } else {
      const newExpense = this.estimatedExpenseRepo.create({
        spendingPlan: activePlan,
        user: { id: userId } as User,
        category: savingCategory,
        amount: monthlyAmount,
        monthlyLimit: monthlyAmount,
        frequencyType: SpendingPlanExpenseFrequency.MONTHLY,
        frequencyValue: 1,
        savingGoalId: options.savingGoalId || null,
        coupleSavingGoalId: options.coupleSavingGoalId || null,
      });
      await this.estimatedExpenseRepo.save(newExpense);
      await this.recalculateAndReload(activePlan.id, userId);
    }
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
