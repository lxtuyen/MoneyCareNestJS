import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { CloneSpendingPlanDto } from './dto/clone-spending-plan.dto';
import { CreateFixedExpenseDto } from './dto/create-fixed-expense.dto';
import { CreateSpendingPlanDto } from './dto/create-spending-plan.dto';
import { MarkFixedExpensePaidDto } from './dto/mark-fixed-expense-paid.dto';
import { UpdateFixedExpenseDto } from './dto/update-fixed-expense.dto';
import { UpdateSpendingPlanDto } from './dto/update-spending-plan.dto';
import { FixedExpense } from './entities/fixed-expense.entity';
import { SpendingPlan } from './entities/spending-plan.entity';
import {
  SpendingPlanStatus,
  SpendingPlanTrackingType,
} from './entities/spending-plan.enums';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';

interface SpendingPlanFilters {
  month?: number;
  year?: number;
  status?: SpendingPlanStatus;
}

interface TrackingTypeInput {
  trackingType?: SpendingPlanTrackingType | null;
}

export interface DailySeriesItem {
  date: string;
  spent: number;
}

@Injectable()
export class SpendingPlansService {
  constructor(
    @InjectRepository(SpendingPlan)
    private readonly planRepo: Repository<SpendingPlan>,

    @InjectRepository(FixedExpense)
    private readonly fixedExpenseRepo: Repository<FixedExpense>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,

    private readonly dataSource: DataSource,
    private readonly calculator: SpendingPlanCalculatorService,
  ) {}

  async create(userId: number, dto: CreateSpendingPlanDto) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const fixedExpenses = await Promise.all(
      (dto.fixedExpenses ?? []).map(async (expense) => {
        const { category, subCategory } =
          await this.resolvePlanItemCategories(expense);
        return this.fixedExpenseRepo.create({
          name: this.resolveFixedExpenseName(expense),
          category,
          subCategory,
          trackingType: this.resolveTrackingType(expense, category),
          amount: expense.amount,
          monthlyLimit: expense.monthlyLimit ?? expense.amount,
          dailyLimit: expense.dailyLimit ?? null,
          frequencyType: expense.frequencyType,
          frequencyValue: expense.frequencyValue,
          dueDay: expense.dueDay ?? null,
          isReminderEnabled: expense.isReminderEnabled ?? false,
          note: expense.note ?? null,
          isPaid: expense.isPaid ?? false,
          linkedTransactionId: expense.linkedTransactionId ?? null,
          user,
        });
      }),
    );
    const period = this.resolvePlanPeriod(dto.month, dto.year);

    const calculation = this.calculator.calculate({
      totalAmount: dto.totalAmount,
      savingTargetAmount: dto.savingTargetAmount ?? 0,
      fixedExpenses,
      month: period.month,
      year: period.year,
    });

    const plan = this.planRepo.create({
      month: period.month,
      year: period.year,
      totalAmount: dto.totalAmount,
      savingTargetAmount: dto.savingTargetAmount ?? 0,
      status: SpendingPlanStatus.DRAFT,
      fixedExpenses,
      user,
      ...calculation,
    });

    fixedExpenses.forEach((expense) => {
      expense.spendingPlan = plan;
    });

    const saved = await this.planRepo.save(plan);
    const reloaded = await this.loadPlanForUser(saved.id, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async findAll(userId: number, filters: SpendingPlanFilters) {
    const where: any = { user: { id: userId } };
    if (filters.month) where.month = filters.month;
    if (filters.year) where.year = filters.year;
    if (filters.status) where.status = filters.status;

    const plans = await this.planRepo.find({
      where,
      relations: ['fixedExpenses'],
      order: { year: 'DESC', month: 'DESC', createdAt: 'DESC' },
    });
    plans.forEach((plan) => this.applyCalculation(plan));
    const enrichedPlans = await Promise.all(
      plans.map((plan) => this.enrichPlanUsageForResponse(plan, userId)),
    );

    return this.ok(enrichedPlans);
  }

  async findOne(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    return this.ok(await this.enrichPlanUsageForResponse(plan, userId));
  }

  async findActive(userId: number) {
    const plan = await this.planRepo.findOne({
      where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      relations: ['fixedExpenses'],
      order: { activatedAt: 'DESC' },
    });
    if (plan) {
      this.applyCalculation(plan);
    }

    return this.ok(
      plan ? await this.enrichPlanUsageForResponse(plan, userId) : null,
    );
  }

  async update(id: number, userId: number, dto: UpdateSpendingPlanDto) {
    const plan = await this.loadPlanForUser(id, userId);
    this.assertPlanEditable(plan);

    if (dto.month !== undefined) plan.month = dto.month;
    if (dto.year !== undefined) plan.year = dto.year;
    if (dto.totalAmount !== undefined) plan.totalAmount = dto.totalAmount;
    if (dto.savingTargetAmount !== undefined) {
      plan.savingTargetAmount = dto.savingTargetAmount;
    }

    if (dto.fixedExpenses !== undefined) {
      if (plan.fixedExpenses?.length) {
        await this.fixedExpenseRepo.remove(plan.fixedExpenses);
      }

      plan.fixedExpenses = await Promise.all(
        dto.fixedExpenses.map(async (expense) => {
          const { category, subCategory } =
            await this.resolvePlanItemCategories(expense);
          return this.fixedExpenseRepo.create({
            name: this.resolveFixedExpenseName(expense),
            category,
            subCategory,
            trackingType: this.resolveTrackingType(expense, category),
            amount: expense.amount,
            monthlyLimit: expense.monthlyLimit ?? expense.amount,
            dailyLimit: expense.dailyLimit ?? null,
            frequencyType: expense.frequencyType,
            frequencyValue: expense.frequencyValue,
            dueDay: expense.dueDay ?? null,
            isReminderEnabled: expense.isReminderEnabled ?? false,
            note: expense.note ?? null,
            isPaid: expense.isPaid ?? false,
            linkedTransactionId: expense.linkedTransactionId ?? null,
            user: plan.user,
            spendingPlan: plan,
          });
        }),
      );
    }

    this.applyCalculation(plan);
    await this.planRepo.save(plan);
    const reloaded = await this.loadPlanForUser(id, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async activate(id: number, userId: number) {
    const activated = await this.dataSource.transaction(async (manager) => {
      const plan = await manager.findOne(SpendingPlan, {
        where: { id, user: { id: userId } },
        relations: ['fixedExpenses', 'user'],
      });
      if (!plan) {
        throw new NotFoundException('Spending plan not found');
      }
      if (plan.status === SpendingPlanStatus.ARCHIVED) {
        throw new BadRequestException(
          'Archived spending plan cannot be activated',
        );
      }

      const activePlans = await manager.find(SpendingPlan, {
        where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      });
      const now = new Date();

      for (const activePlan of activePlans) {
        if (activePlan.id !== plan.id) {
          activePlan.status = SpendingPlanStatus.PAUSED;
          await manager.save(activePlan);
        }
      }

      plan.status = SpendingPlanStatus.ACTIVE;
      plan.activatedAt = plan.activatedAt ?? now;
      plan.archivedAt = null;
      return manager.save(plan);
    });

    const reloaded = await this.loadPlanForUser(activated.id, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async pause(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    if (plan.status === SpendingPlanStatus.ARCHIVED) {
      throw new BadRequestException('Archived spending plan cannot be paused');
    }
    if (
      plan.status !== SpendingPlanStatus.ACTIVE &&
      plan.status !== SpendingPlanStatus.PAUSED
    ) {
      throw new BadRequestException('Only active spending plan can be paused');
    }

    if (plan.status !== SpendingPlanStatus.PAUSED) {
      plan.status = SpendingPlanStatus.PAUSED;
      plan.archivedAt = null;
      await this.planRepo.save(plan);
    }

    return this.ok(await this.enrichPlanUsageForResponse(plan, userId));
  }

  async archive(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    if (plan.status !== SpendingPlanStatus.ARCHIVED) {
      plan.status = SpendingPlanStatus.ARCHIVED;
      plan.archivedAt = new Date();
      await this.planRepo.save(plan);
    }

    return this.ok(await this.enrichPlanUsageForResponse(plan, userId));
  }

  async remove(id: number, userId: number) {
    const plan = await this.loadPlanForUser(id, userId);
    await this.planRepo.remove(plan);
    return this.ok({ id });
  }

  async clone(id: number, userId: number, dto: CloneSpendingPlanDto) {
    const source = await this.loadPlanForUser(id, userId);
    const user = source.user;
    const fixedExpenses = (source.fixedExpenses ?? []).map((expense) =>
      this.fixedExpenseRepo.create({
        name: expense.name,
        category: expense.category,
        amount: expense.amount,
        frequencyType: expense.frequencyType,
        frequencyValue: expense.frequencyValue,
        dueDay: expense.dueDay,
        isReminderEnabled: expense.isReminderEnabled,
        note: expense.note,
        isPaid: false,
        linkedTransactionId: null,
        user,
      }),
    );
    const period = this.resolvePlanPeriod(dto.month, dto.year);

    const clone = this.planRepo.create({
      month: period.month,
      year: period.year,
      totalAmount: source.totalAmount,
      savingTargetAmount: source.savingTargetAmount,
      status: SpendingPlanStatus.DRAFT,
      user,
      fixedExpenses,
    });

    fixedExpenses.forEach((expense) => {
      expense.spendingPlan = clone;
    });
    this.applyCalculation(clone);

    const saved = await this.planRepo.save(clone);
    const reloaded = await this.loadPlanForUser(saved.id, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async findFixedExpenses(planId: number, userId: number) {
    const plan = await this.loadPlanForUser(planId, userId);
    const fixedExpenses = await this.fixedExpenseRepo.find({
      where: { spendingPlan: { id: planId }, user: { id: userId } },
      order: { dueDay: 'ASC', createdAt: 'ASC' },
    });

    const context = await this.buildExpenseContext(plan, userId, {
      month: plan.month,
      year: plan.year,
    });

    return this.ok(
      fixedExpenses.map((expense) => {
        const enriched = context.planItems.find(
          (item) => item.id === expense.id,
        );
        return enriched ?? expense;
      }),
    );
  }

  async createFixedExpense(
    planId: number,
    userId: number,
    dto: CreateFixedExpenseDto,
  ) {
    const plan = await this.loadPlanForUser(planId, userId);
    this.assertPlanEditable(plan);

    const { category, subCategory } = await this.resolvePlanItemCategories(dto);

    const expense = this.fixedExpenseRepo.create({
      name: this.resolveFixedExpenseName(dto),
      category,
      subCategory,
      trackingType: this.resolveTrackingType(dto, category),
      amount: dto.amount,
      monthlyLimit: dto.monthlyLimit ?? dto.amount,
      dailyLimit: dto.dailyLimit ?? null,
      frequencyType: dto.frequencyType,
      frequencyValue: dto.frequencyValue,
      dueDay: dto.dueDay ?? null,
      isReminderEnabled: dto.isReminderEnabled ?? false,
      note: dto.note ?? null,
      isPaid: dto.isPaid ?? false,
      linkedTransactionId: dto.linkedTransactionId ?? null,
      spendingPlan: plan,
      user: plan.user,
    });

    await this.fixedExpenseRepo.save(expense);
    const reloaded = await this.recalculateAndReload(planId, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async updateFixedExpense(
    planId: number,
    expenseId: number,
    userId: number,
    dto: UpdateFixedExpenseDto,
  ) {
    const plan = await this.loadPlanForUser(planId, userId);
    this.assertPlanEditable(plan);
    const expense = await this.loadFixedExpense(planId, expenseId, userId);

    if (dto.name !== undefined) expense.name = dto.name;
    if (dto.category !== undefined) {
      expense.category = dto.category
        ? await this.categoryRepo.findOne({ where: { name: dto.category } })
        : null;
    }
    if (dto.categoryId !== undefined) {
      expense.category = dto.categoryId
        ? await this.categoryRepo.findOne({ where: { id: dto.categoryId } })
        : null;
    }
    if (dto.subCategoryId !== undefined) {
      expense.subCategory = dto.subCategoryId
        ? await this.subCategoryRepo.findOne({
            where: { id: dto.subCategoryId },
            relations: ['category'],
          })
        : null;
      if (
        expense.category &&
        expense.subCategory &&
        expense.subCategory.category?.id !== expense.category.id
      ) {
        throw new BadRequestException(
          'Sub category does not belong to category',
        );
      }
    }
    if (dto.trackingType !== undefined) expense.trackingType = dto.trackingType;
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.monthlyLimit !== undefined) expense.monthlyLimit = dto.monthlyLimit;
    if (dto.dailyLimit !== undefined) expense.dailyLimit = dto.dailyLimit;
    if (dto.frequencyType !== undefined)
      expense.frequencyType = dto.frequencyType;
    if (dto.frequencyValue !== undefined)
      expense.frequencyValue = dto.frequencyValue;
    if (dto.dueDay !== undefined) expense.dueDay = dto.dueDay;
    if (dto.isReminderEnabled !== undefined)
      expense.isReminderEnabled = dto.isReminderEnabled;
    if (dto.note !== undefined) expense.note = dto.note;
    if (dto.isPaid !== undefined) expense.isPaid = dto.isPaid;
    if (dto.linkedTransactionId !== undefined) {
      expense.linkedTransactionId = dto.linkedTransactionId;
    }

    await this.fixedExpenseRepo.save(expense);
    const reloaded = await this.recalculateAndReload(planId, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async deleteFixedExpense(planId: number, expenseId: number, userId: number) {
    const plan = await this.loadPlanForUser(planId, userId);
    this.assertPlanEditable(plan);
    const expense = await this.loadFixedExpense(planId, expenseId, userId);

    await this.fixedExpenseRepo.remove(expense);
    const reloaded = await this.recalculateAndReload(planId, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async markFixedExpensePaid(
    planId: number,
    expenseId: number,
    userId: number,
    dto: MarkFixedExpensePaidDto,
  ) {
    const plan = await this.loadPlanForUser(planId, userId);
    this.assertPlanEditable(plan);
    const expense = await this.loadFixedExpense(planId, expenseId, userId);

    if (dto.transactionId) {
      const transaction = await this.transactionRepo.findOne({
        where: { id: dto.transactionId, user: { id: userId } },
      });
      if (!transaction) {
        throw new NotFoundException('Transaction not found');
      }
      expense.linkedTransactionId = transaction.id;
    }

    expense.isPaid = true;
    await this.fixedExpenseRepo.save(expense);
    const reloaded = await this.loadPlanForUser(planId, userId);
    return this.ok(await this.enrichPlanUsageForResponse(reloaded, userId));
  }

  async getActiveHomeSummary(userId: number) {
    const plan = await this.findActivePlanEntity(userId);
    if (!plan) {
      return this.ok(null);
    }

    const period = this.getCurrentPeriod();
    const context = await this.buildExpenseContext(plan, userId, period);
    const currentDay = this.getReportDay(period);
    const startDay = Math.max(1, currentDay - 6);
    const last7Days = this.buildDailySeries(
      plan,
      context.dailySpentMap,
      startDay,
      currentDay,
      period,
    );
    const today = last7Days[last7Days.length - 1] ?? null;

    return this.ok({
      planId: plan.id,
      planName: this.getPlanDisplayName(),
      mealLimit: 0, // Deprecated
      remainingAmount: context.remainingAmount,
      todaySpent: today?.spent ?? 0,
      last7Days: last7Days.map(({ date, spent }) => ({
        date,
        spent,
      })),
    });
  }

  async getActiveStatistics(userId: number) {
    const plan = await this.findActivePlanEntity(userId);
    if (!plan) {
      return this.ok(null);
    }

    const period = this.getCurrentPeriod();
    const context = await this.buildExpenseContext(plan, userId, period);
    const currentDay = this.getReportDay(period);
    const dailySeries = this.buildDailySeries(
      plan,
      context.dailySpentMap,
      1,
      currentDay,
      period,
    );

    const daysLeft = this.calculateDaysLeft(period);

    return this.ok({
      planId: plan.id,
      planName: this.getPlanDisplayName(),
      mealLimit: 0,
      availableSpendingAmount: plan.availableSpendingAmount,
      spentFlexibleAmount: context.spentFlexibleAmount,
      spentFixedAmount: context.spentFixedAmount,
      remainingAmount: context.remainingAmount,
      daysLeft,
      projectedEndBalance: context.projectedEndBalance,
      dailySeries,
      fixedExpenses: context.planItems,
    });
  }

  private async findActivePlanEntity(userId: number) {
    const plan = await this.planRepo.findOne({
      where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      relations: ['fixedExpenses', 'user'],
      order: { activatedAt: 'DESC' },
    });
    if (plan) {
      this.applyCalculation(plan);
    }
    return plan;
  }

  private async buildExpenseContext(
    plan: SpendingPlan,
    userId: number,
    period = this.getCurrentPeriod(),
  ) {
    const { start, end } = this.getVietnamMonthRange(period.month, period.year);
    const expenses = await this.transactionRepo
      .createQueryBuilder('transaction')
      .leftJoin('transaction.user', 'user')
      .leftJoinAndSelect('transaction.category', 'category')
      .leftJoinAndSelect('transaction.subCategory', 'subCategory')
      .where('user.id = :userId', { userId })
      .andWhere('transaction.type = :type', { type: 'expense' })
      .andWhere('transaction.transaction_date >= :start', { start })
      .andWhere('transaction.transaction_date <= :end', { end })
      .getMany();

    const fixedTransactionIds = new Set(
      (plan.fixedExpenses ?? [])
        .map((expense) => expense.linkedTransactionId)
        .filter((id): id is number => typeof id === 'number'),
    );
    const dailySpentMap = new Map<string, number>();
    const todayKey = this.formatPlanDay(
      period.year,
      period.month,
      this.getReportDay(period),
    );
    let spentFlexibleAmount = 0;
    let spentFixedAmount = 0;
    const planItemTotals = new Map<
      number,
      { spentThisMonth: number; todaySpent: number }
    >();

    for (const transaction of expenses) {
      const amount = Number(transaction.amount ?? 0);
      const transactionDateKey = this.formatDateKey(
        transaction.transaction_date,
      );
      let matchesPlanItem = false;

      for (const item of plan.fixedExpenses ?? []) {
        const matchesSubCategory =
          item.subCategory?.id &&
          transaction.subCategory?.id === item.subCategory.id;
        const matchesCategory =
          !item.subCategory?.id &&
          item.category?.id &&
          transaction.category?.id === item.category.id;
        if (!matchesSubCategory && !matchesCategory) continue;

        const totals = planItemTotals.get(item.id) ?? {
          spentThisMonth: 0,
          todaySpent: 0,
        };
        totals.spentThisMonth += amount;
        if (transactionDateKey === todayKey) {
          totals.todaySpent += amount;
        }
        planItemTotals.set(item.id, totals);
        matchesPlanItem = true;
      }

      if (fixedTransactionIds.has(transaction.id) || matchesPlanItem) {
        spentFixedAmount += amount;
        continue;
      }

      spentFlexibleAmount += amount;
      dailySpentMap.set(
        transactionDateKey,
        (dailySpentMap.get(transactionDateKey) ?? 0) + amount,
      );
    }

    const remainingAmount = this.roundMoney(
      plan.availableSpendingAmount - spentFlexibleAmount,
    );
    const daysPassed = Math.max(1, this.getReportDay(period));
    const daysInMonth = this.calculator.getDaysInMonth(
      period.month,
      period.year,
    );
    const averageDailySpent = spentFlexibleAmount / daysPassed;
    const projectedEndBalance = this.roundMoney(
      plan.availableSpendingAmount - averageDailySpent * daysInMonth,
    );

    return {
      dailySpentMap,
      spentFlexibleAmount: this.roundMoney(spentFlexibleAmount),
      spentFixedAmount: this.roundMoney(spentFixedAmount),
      remainingAmount,
      projectedEndBalance,
      planItems: (plan.fixedExpenses ?? []).map((item) => {
        const totals = planItemTotals.get(item.id) ?? {
          spentThisMonth: 0,
          todaySpent: 0,
        };
        const trackingType = this.resolveTrackingType(item, item.category);
        const monthlyLimit =
          Number(item.monthlyLimit || 0) ||
          this.resolveMonthlyLimit(item, period);
        const dailyLimit =
          item.dailyLimit == null ? null : Number(item.dailyLimit);
        const todaySpent = this.roundMoney(totals.todaySpent);
        return {
          ...item,
          trackingType,
          monthlyLimit,
          dailyLimit,
          spentThisMonth: this.roundMoney(totals.spentThisMonth),
          todaySpent,
          monthlyProgress:
            monthlyLimit > 0
              ? Math.round((totals.spentThisMonth / monthlyLimit) * 1000) / 10
              : 0,
          dailyOverAmount:
            dailyLimit && todaySpent > dailyLimit
              ? this.roundMoney(todaySpent - dailyLimit)
              : 0,
        };
      }),
    };
  }

  private buildDailySeries(
    plan: SpendingPlan,
    dailySpentMap: Map<string, number>,
    startDay: number,
    endDay: number,
    period = this.getCurrentPeriod(),
  ): DailySeriesItem[] {
    const series: DailySeriesItem[] = [];

    for (let day = startDay; day <= endDay; day++) {
      const date = this.formatPlanDay(period.year, period.month, day);
      const spent = this.roundMoney(dailySpentMap.get(date) ?? 0);
      series.push({
        date,
        spent,
      });
    }

    return series;
  }

  private async recalculateAndReload(planId: number, userId: number) {
    const plan = await this.loadPlanForUser(planId, userId);
    this.applyCalculation(plan);
    await this.planRepo.save(plan);
    return this.loadPlanForUser(planId, userId);
  }

  private async enrichPlanUsageForResponse(plan: SpendingPlan, userId: number) {
    const context = await this.buildExpenseContext(plan, userId, {
      month: plan.month,
      year: plan.year,
    });

    return {
      ...plan,
      fixedExpenses: context.planItems,
    };
  }

  private resolveMonthlyLimit(
    item: FixedExpense,
    period: { month: number; year: number },
  ) {
    const amount = Number(item.amount || 0);
    const frequencyValue = Number(item.frequencyValue || 1);
    const frequencyType = item.frequencyType?.toLowerCase();

    if (frequencyType === 'daily') {
      return (
        amount *
        frequencyValue *
        this.calculator.getDaysInMonth(period.month, period.year)
      );
    }

    if (frequencyType === 'weekly') {
      return (
        amount *
        frequencyValue *
        (this.calculator.getDaysInMonth(period.month, period.year) / 7)
      );
    }

    return amount * frequencyValue;
  }

  private async resolvePlanItemCategories(
    dto: CreateFixedExpenseDto | UpdateFixedExpenseDto,
  ) {
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

  private resolveTrackingType(
    dto: TrackingTypeInput,
    category: Category | null,
  ): SpendingPlanTrackingType {
    void category;
    if (dto.trackingType) {
      return dto.trackingType;
    }
    return SpendingPlanTrackingType.FIXED_BILL;
  }

  private applyCalculation(plan: SpendingPlan) {
    const calculation = this.calculator.calculate({
      totalAmount: plan.totalAmount,
      savingTargetAmount: plan.savingTargetAmount,
      fixedExpenses: plan.fixedExpenses ?? [],
      month: plan.month,
      year: plan.year,
    });

    Object.assign(plan, calculation);
  }

  private async loadPlanForUser(id: number, userId: number) {
    const plan = await this.planRepo.findOne({
      where: { id, user: { id: userId } },
      relations: ['fixedExpenses', 'user'],
      order: { fixedExpenses: { dueDay: 'ASC', createdAt: 'ASC' } },
    });
    if (!plan) {
      throw new NotFoundException('Spending plan not found');
    }
    this.applyCalculation(plan);

    return plan;
  }

  private async loadFixedExpense(
    planId: number,
    expenseId: number,
    userId: number,
  ) {
    const expense = await this.fixedExpenseRepo.findOne({
      where: {
        id: expenseId,
        spendingPlan: { id: planId },
        user: { id: userId },
      },
    });
    if (!expense) {
      throw new NotFoundException('Fixed expense not found');
    }

    return expense;
  }

  private assertPlanEditable(plan: SpendingPlan) {
    if (plan.status === SpendingPlanStatus.ARCHIVED) {
      throw new BadRequestException('Archived spending plan cannot be edited');
    }
  }

  private calculateDaysLeft(period = this.getCurrentPeriod()): number {
    const now = this.getVietnamNow();
    const daysInMonth = this.calculator.getDaysInMonth(
      period.month,
      period.year,
    );

    if (now.getFullYear() > period.year) return 0;
    if (
      now.getFullYear() === period.year &&
      now.getMonth() + 1 > period.month
    ) {
      return 0;
    }
    if (now.getFullYear() < period.year) return daysInMonth;
    if (now.getMonth() + 1 < period.month) return daysInMonth;

    return Math.max(0, daysInMonth - now.getDate() + 1);
  }

  private getReportDay(period = this.getCurrentPeriod()): number {
    const now = this.getVietnamNow();
    const daysInMonth = this.calculator.getDaysInMonth(
      period.month,
      period.year,
    );

    if (
      now.getFullYear() === period.year &&
      now.getMonth() + 1 === period.month
    ) {
      return Math.min(now.getDate(), daysInMonth);
    }

    if (
      now.getFullYear() > period.year ||
      (now.getFullYear() === period.year && now.getMonth() + 1 > period.month)
    ) {
      return daysInMonth;
    }

    return 1;
  }

  private getVietnamMonthRange(month: number, year: number) {
    const daysInMonth = this.calculator.getDaysInMonth(month, year);
    return {
      start: new Date(Date.UTC(year, month - 1, 1, -7, 0, 0, 0)),
      end: new Date(Date.UTC(year, month - 1, daysInMonth, 16, 59, 59, 999)),
    };
  }

  private getVietnamNow(): Date {
    const now = new Date();
    const vietnamNowString = now.toLocaleString('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    return new Date(vietnamNowString);
  }

  private getCurrentPeriod() {
    const now = this.getVietnamNow();
    return {
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    };
  }

  private resolvePlanPeriod(month?: number, year?: number) {
    const current = this.getCurrentPeriod();
    return {
      month: month ?? current.month,
      year: year ?? current.year,
    };
  }

  private getPlanDisplayName(): string {
    return 'Kế hoạch chi tiêu';
  }

  private resolveFixedExpenseName(dto: {
    name?: string;
    category?: string | null;
    note?: string | null;
  }): string {
    return (
      dto.category?.trim() ||
      dto.name?.trim() ||
      dto.note?.trim() ||
      'Khoản phí khác'
    );
  }

  private formatDateKey(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  private formatPlanDay(year: number, month: number, day: number): string {
    return [
      year.toString().padStart(4, '0'),
      month.toString().padStart(2, '0'),
      day.toString().padStart(2, '0'),
    ].join('-');
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private ok<T>(data: T): ApiResponse<T> {
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data,
    });
  }
  /**
   * Calculates the user's monthly saving capacity based on the active spending plan.
   * Used by SavingGoals and AI modules for projection calculations.
   * Returns null if no active plan exists.
   */
  async getMonthlySavingCapacity(userId: number): Promise<{
    savingTargetAmount: number;
    projectedEndBalance: number;
    monthlySavingCapacity: number;
    totalAmount: number;
    fixedExpenseTotal: number;
    availableSpendingAmount: number;
  } | null> {
    const plan = await this.findActivePlanEntity(userId);
    if (!plan) return null;

    const period = this.getCurrentPeriod();
    const context = await this.buildExpenseContext(plan, userId, period);

    const savingTargetAmount = Number(plan.savingTargetAmount ?? 0);
    const projectedEndBalance = context.projectedEndBalance;
    const surplusFromFlexible = Math.max(0, projectedEndBalance);
    const monthlySavingCapacity = this.roundMoney(
      savingTargetAmount + surplusFromFlexible,
    );

    return {
      savingTargetAmount,
      projectedEndBalance,
      monthlySavingCapacity,
      totalAmount: Number(plan.totalAmount ?? 0),
      fixedExpenseTotal: Number(plan.fixedExpenseTotal ?? 0),
      availableSpendingAmount: Number(plan.availableSpendingAmount ?? 0),
    };
  }
}
