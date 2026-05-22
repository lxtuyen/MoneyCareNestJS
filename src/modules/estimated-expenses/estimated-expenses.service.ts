import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ok } from 'src/common/utils/response.util';
import { EstimatedExpense } from './entities/estimated-expense.entity';
import { CreateEstimatedExpenseDto } from './dto/create-estimated-expense.dto';
import { UpdateEstimatedExpenseDto } from './dto/update-estimated-expense.dto';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';

@Injectable()
export class EstimatedExpensesService {
  constructor(
    @InjectRepository(EstimatedExpense)
    public readonly estimatedExpenseRepo: Repository<EstimatedExpense>,

    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,

    @InjectRepository(SubCategory)
    private readonly subCategoryRepo: Repository<SubCategory>,

    @Inject(forwardRef(() => SpendingPlansService))
    private readonly spendingPlansService: SpendingPlansService,
  ) {}

  async findEstimatedExpenses(planId: number, userId: number) {
    const plan = await this.spendingPlansService.loadPlanForUser(
      planId,
      userId,
    );
    const estimatedExpenses = await this.estimatedExpenseRepo.find({
      where: { spendingPlan: { id: planId }, user: { id: userId } },
      order: { createdAt: 'ASC' },
    });

    const context = await this.spendingPlansService.buildExpenseContext(
      plan,
      userId,
    );

    return ok(
      estimatedExpenses.map((expense) => {
        const enriched = context.planItems.find(
          (item) => item.id === expense.id,
        );
        return enriched ?? expense;
      }),
    );
  }

  async createEstimatedExpense(
    planId: number,
    userId: number,
    dto: CreateEstimatedExpenseDto,
  ) {
    const plan = await this.spendingPlansService.loadPlanForUser(
      planId,
      userId,
    );

    const { category, subCategory } = await this.resolvePlanItemCategories(dto);

    const expense = this.estimatedExpenseRepo.create({
      category,
      subCategory,
      amount: dto.amount,
      monthlyLimit: dto.monthlyLimit ?? dto.amount,
      dailyLimit: dto.dailyLimit ?? null,
      frequencyType: dto.frequencyType,
      frequencyValue: dto.frequencyValue,
      spendingPlan: plan,
      user: plan.user,
    });

    await this.estimatedExpenseRepo.save(expense);
    const reloaded = await this.spendingPlansService.recalculateAndReload(
      planId,
      userId,
    );
    return ok(
      await this.spendingPlansService.enrichPlanUsageForResponse(
        reloaded,
        userId,
      ),
    );
  }

  async updateEstimatedExpense(
    planId: number,
    expenseId: number,
    userId: number,
    dto: UpdateEstimatedExpenseDto,
  ) {
    const plan = await this.spendingPlansService.loadPlanForUser(
      planId,
      userId,
    );
    const expense = await this.loadEstimatedExpense(planId, expenseId, userId);

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
    if (dto.amount !== undefined) expense.amount = dto.amount;
    if (dto.monthlyLimit !== undefined) expense.monthlyLimit = dto.monthlyLimit;
    if (dto.dailyLimit !== undefined) expense.dailyLimit = dto.dailyLimit;
    if (dto.frequencyType !== undefined)
      expense.frequencyType = dto.frequencyType;
    if (dto.frequencyValue !== undefined)
      expense.frequencyValue = dto.frequencyValue;
    await this.estimatedExpenseRepo.save(expense);
    const reloaded = await this.spendingPlansService.recalculateAndReload(
      planId,
      userId,
    );
    return ok(
      await this.spendingPlansService.enrichPlanUsageForResponse(
        reloaded,
        userId,
      ),
    );
  }

  async deleteEstimatedExpense(
    planId: number,
    expenseId: number,
    userId: number,
  ) {
    const plan = await this.spendingPlansService.loadPlanForUser(
      planId,
      userId,
    );
    const expense = await this.loadEstimatedExpense(planId, expenseId, userId);

    await this.estimatedExpenseRepo.remove(expense);
    const reloaded = await this.spendingPlansService.recalculateAndReload(
      planId,
      userId,
    );
    return ok(
      await this.spendingPlansService.enrichPlanUsageForResponse(
        reloaded,
        userId,
      ),
    );
  }

  async loadEstimatedExpense(
    planId: number,
    expenseId: number,
    userId: number,
  ) {
    const expense = await this.estimatedExpenseRepo.findOne({
      where: {
        id: expenseId,
        spendingPlan: { id: planId },
        user: { id: userId },
      },
    });
    if (!expense) {
      throw new NotFoundException('Estimated expense not found');
    }

    return expense;
  }

  private async resolvePlanItemCategories(
    dto: CreateEstimatedExpenseDto | UpdateEstimatedExpenseDto,
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
}
