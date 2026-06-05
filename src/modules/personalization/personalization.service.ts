import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PersonalFinanceProfile } from './entities/personal-finance-profile.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import { UserCategoryPreference } from 'src/modules/categories/entities/user-category-preference.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { SpendingPlanStatus } from 'src/modules/spending-plans/interfaces/spending-plan.enums';
import { AiFeedbackService } from 'src/modules/ai-feedback/ai-feedback.service';

@Injectable()
export class PersonalizationService {
  constructor(
    @InjectRepository(PersonalFinanceProfile)
    private readonly profileRepo: Repository<PersonalFinanceProfile>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectRepository(SavingGoal)
    private readonly goalRepo: Repository<SavingGoal>,

    @InjectRepository(SpendingPlan)
    private readonly planRepo: Repository<SpendingPlan>,

    @InjectRepository(UserCategoryPreference)
    private readonly preferenceRepo: Repository<UserCategoryPreference>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly aiFeedbackService: AiFeedbackService,
  ) {}

  async getOrBuildProfile(userId: number): Promise<PersonalFinanceProfile> {
    let profile = await this.profileRepo.findOne({ where: { userId } });
    const now = new Date();

    if (!profile) {
      profile = await this.buildProfile(userId);
    } else {
      // Rebuild if older than 24 hours
      const diffMs = now.getTime() - new Date(profile.generatedAt).getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours >= 24) {
        profile = await this.buildProfile(userId);
      }
    }
    return profile;
  }

  async rebuildProfile(userId: number): Promise<PersonalFinanceProfile> {
    return this.buildProfile(userId);
  }

  async getProfileSummary(userId: number) {
    const profile = await this.getOrBuildProfile(userId);
    return {
      spendingStyle: profile.spendingStyle,
      riskLevel: profile.riskLevel,
      averageMonthlyIncome: profile.averageMonthlyIncome,
      savingsRate: profile.savingsRate,
      budgetDisciplineScore: profile.budgetDisciplineScore,
      expenseVolatilityScore: profile.expenseVolatilityScore,
      preferredBudgetBufferPct: profile.preferredBudgetBufferPct,
      confidenceScore: profile.confidenceScore,
      essentialCategories: profile.essentialCategories || [],
      recurringExpenseHints: profile.recurringExpenseHints || [],
      feedbackSummary: profile.feedbackSummary || {},
    };
  }

  private async buildProfile(userId: number): Promise<PersonalFinanceProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const now = new Date();
    const periodEnd = new Date(now);
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - 180); // Last 6 months

    // 1. Fetch transactions (excluding transfers)
    const transactions = await this.transactionRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.category', 'category')
      .where('t.userId = :userId', { userId })
      .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
      .andWhere('t.transaction_date >= :periodStart', { periodStart })
      .orderBy('t.transaction_date', 'ASC')
      .getMany();

    // 2. Fetch saving goals (active)
    const activeSavingGoalsCount = await this.goalRepo.count({
      where: { user: { id: userId }, is_completed: false },
    });

    // 3. Fetch active spending plan
    const activePlan = await this.planRepo.findOne({
      where: { user: { id: userId }, status: SpendingPlanStatus.ACTIVE },
      relations: [
        'estimatedExpenses',
        'estimatedExpenses.category',
        'estimatedExpenses.subCategory',
      ],
    });

    // 4. Calculate active duration
    const firstDate =
      transactions.length > 0
        ? new Date(transactions[0].transaction_date)
        : new Date();
    firstDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const oneDayMs = 24 * 60 * 60 * 1000;
    const daysCount = Math.max(
      1,
      Math.ceil((today.getTime() - firstDate.getTime()) / oneDayMs) + 1,
    );
    const activeMonths = daysCount / 30.4;

    // 5. Calculate Average Monthly Income / Expense / Savings
    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of transactions) {
      const amt = Number(tx.amount || 0);
      if (tx.type === 'income') {
        totalIncome += amt;
      } else if (tx.type === 'expense') {
        totalExpense += amt;
      }
    }

    const averageMonthlyIncome = totalIncome / activeMonths;
    const averageMonthlyExpense = totalExpense / activeMonths;
    const averageMonthlySavings = averageMonthlyIncome - averageMonthlyExpense;
    const savingsRate =
      averageMonthlyIncome > 0
        ? averageMonthlySavings / averageMonthlyIncome
        : 0;

    // 6. Expense Volatility Score (Standard Deviation / Mean)
    const dailyExpenses: Record<string, number> = {};
    for (let i = 0; i < daysCount; i++) {
      const d = new Date(firstDate.getTime() + i * oneDayMs);
      const dateStr = d.toISOString().split('T')[0];
      dailyExpenses[dateStr] = 0;
    }

    for (const tx of transactions) {
      if (tx.type === 'expense') {
        const dateStr = new Date(tx.transaction_date)
          .toISOString()
          .split('T')[0];
        if (dailyExpenses[dateStr] !== undefined) {
          dailyExpenses[dateStr] += Number(tx.amount || 0);
        }
      }
    }

    const dailyValues = Object.values(dailyExpenses);
    const totalDaysExpense = dailyValues.reduce((sum, val) => sum + val, 0);
    const dailyMean =
      dailyValues.length > 0 ? totalDaysExpense / dailyValues.length : 0;

    let varianceSum = 0;
    for (const val of dailyValues) {
      varianceSum += Math.pow(val - dailyMean, 2);
    }
    const dailyStd =
      dailyValues.length > 1
        ? Math.sqrt(varianceSum / (dailyValues.length - 1))
        : 0;
    const volatilityRaw = dailyMean > 0 ? dailyStd / dailyMean : 0;
    const expenseVolatilityScore = Math.min(
      100,
      Math.round(volatilityRaw * 50),
    );

    // 7. Budget Discipline Score
    let budgetDisciplineScore = 100;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    if (
      activePlan &&
      activePlan.estimatedExpenses &&
      activePlan.estimatedExpenses.length > 0
    ) {
      const currentMonthExpenses = await this.transactionRepo
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.category', 'category')
        .leftJoinAndSelect('t.subCategory', 'subCategory')
        .where('t.userId = :userId', { userId })
        .andWhere('t.type = :type', { type: 'expense' })
        .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
        .andWhere('t.transaction_date >= :startOfMonth', { startOfMonth })
        .getMany();

      for (const item of activePlan.estimatedExpenses) {
        let actualSpent = 0;
        for (const tx of currentMonthExpenses) {
          const matchesSubCategory =
            item.subCategory?.id && tx.subCategory?.id === item.subCategory.id;
          const matchesCategory =
            !item.subCategory?.id &&
            item.category?.id &&
            tx.category?.id === item.category.id;

          if (matchesSubCategory || matchesCategory) {
            actualSpent += Number(tx.amount || 0);
          }
        }

        const monthlyLimit = Number(item.monthlyLimit || item.amount || 0);
        if (monthlyLimit > 0) {
          const ratio = actualSpent / monthlyLimit;
          if (ratio >= 1.0) {
            budgetDisciplineScore -= 12;
          } else if (ratio >= 0.85) {
            budgetDisciplineScore -= 6;
          }
        }
      }
    } else {
      budgetDisciplineScore -= Math.round(expenseVolatilityScore * 0.2);
    }

    if (averageMonthlySavings < 0) {
      budgetDisciplineScore -= 20;
    }
    budgetDisciplineScore = Math.max(0, Math.min(100, budgetDisciplineScore));

    // 8. Top Expense Categories
    const categorySum: Record<
      number,
      { id: number; name: string; amount: number }
    > = {};
    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.category) {
        const catId = tx.category.id;
        const amt = Number(tx.amount || 0);
        if (!categorySum[catId]) {
          categorySum[catId] = {
            id: catId,
            name: tx.category.name,
            amount: 0,
          };
        }
        categorySum[catId].amount += amt;
      }
    }
    const topExpenseCategories = Object.values(categorySum)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    // 9. Essential Categories from preferences
    const preferences = await this.preferenceRepo.find({
      where: { user: { id: userId }, isEssential: true },
      relations: ['category'],
    });
    const essentialCategories = preferences.map((p) => ({
      id: p.category.id,
      name: p.category.name,
    }));

    // 10. Frequent Expense Days of week (0 = Sunday, 1 = Monday...)
    const dayOfWeekCount: Record<number, number> = {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      6: 0,
    };
    for (const tx of transactions) {
      if (tx.type === 'expense') {
        const day = new Date(tx.transaction_date).getDay();
        dayOfWeekCount[day] += 1;
      }
    }
    const frequentExpenseDays = Object.entries(dayOfWeekCount)
      .map(([day, count]) => ({ day: Number(day), count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    // 11. Recurring Expense Hints (heuristic)
    const groups: Record<
      string,
      {
        categoryId: number;
        categoryName: string;
        amount: number;
        dates: Date[];
      }
    > = {};
    for (const tx of transactions) {
      if (tx.type === 'expense' && tx.category) {
        const roundedAmt = Math.round(Number(tx.amount || 0) / 10000) * 10000;
        const key = `${tx.category.id}_${roundedAmt}`;
        if (!groups[key]) {
          groups[key] = {
            categoryId: tx.category.id,
            categoryName: tx.category.name,
            amount: roundedAmt,
            dates: [],
          };
        }
        groups[key].dates.push(new Date(tx.transaction_date));
      }
    }

    const recurringExpenseHints: any[] = [];
    for (const key of Object.keys(groups)) {
      const g = groups[key];
      if (g.dates.length >= 3) {
        g.dates.sort((a, b) => a.getTime() - b.getTime());
        let totalGapDays = 0;
        for (let i = 1; i < g.dates.length; i++) {
          totalGapDays +=
            (g.dates[i].getTime() - g.dates[i - 1].getTime()) /
            (24 * 60 * 60 * 1000);
        }
        const avgGapDays = totalGapDays / (g.dates.length - 1);
        if (avgGapDays >= 25 && avgGapDays <= 35) {
          recurringExpenseHints.push({
            categoryId: g.categoryId,
            categoryName: g.categoryName,
            estimatedAmount: g.amount,
            frequency: 'monthly',
          });
        } else if (avgGapDays >= 5 && avgGapDays <= 9) {
          recurringExpenseHints.push({
            categoryId: g.categoryId,
            categoryName: g.categoryName,
            estimatedAmount: g.amount,
            frequency: 'weekly',
          });
        }
      }
    }

    // 12. Income and Expense Trend (last 30 vs previous 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    let incomeLast30 = 0;
    let expenseLast30 = 0;
    let incomePrev30 = 0;
    let expensePrev30 = 0;

    for (const tx of transactions) {
      const amt = Number(tx.amount || 0);
      const txDate = new Date(tx.transaction_date);
      if (txDate >= thirtyDaysAgo) {
        if (tx.type === 'income') incomeLast30 += amt;
        else if (tx.type === 'expense') expenseLast30 += amt;
      } else if (txDate >= sixtyDaysAgo) {
        if (tx.type === 'income') incomePrev30 += amt;
        else if (tx.type === 'expense') expensePrev30 += amt;
      }
    }

    const calculateTrend = (
      current: number,
      previous: number,
    ): 'increasing' | 'stable' | 'decreasing' => {
      if (previous <= 0) return 'stable';
      const pct = (current - previous) / previous;
      if (pct > 0.1) return 'increasing';
      if (pct < -0.1) return 'decreasing';
      return 'stable';
    };

    const monthlyIncomeTrend = calculateTrend(incomeLast30, incomePrev30);
    const monthlyExpenseTrend = calculateTrend(expenseLast30, expensePrev30);

    // 13. Financial Health Score
    let financialHealthScore = 100;
    if (savingsRate < 0) {
      financialHealthScore -= 30;
    } else if (savingsRate < 0.1) {
      financialHealthScore -= 15;
    } else if (savingsRate < 0.2) {
      financialHealthScore -= 5;
    }

    if (budgetDisciplineScore < 50) {
      financialHealthScore -= 20;
    } else if (budgetDisciplineScore < 75) {
      financialHealthScore -= 10;
    }

    if (expenseVolatilityScore > 60) {
      financialHealthScore -= 10;
    }
    financialHealthScore = Math.max(0, Math.min(100, financialHealthScore));

    // 14. Risk Level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (savingsRate < 0 || budgetDisciplineScore < 50) {
      riskLevel = 'high';
    } else if (savingsRate < 0.1 || expenseVolatilityScore > 60) {
      riskLevel = 'medium';
    }

    // 15. Spending Style
    let spendingStyle:
      | 'stable'
      | 'impulsive'
      | 'seasonal'
      | 'goal_driven'
      | 'income_driven'
      | 'insufficient_data' = 'stable';
    const transactionCount = transactions.length;

    if (transactionCount < 10 || daysCount < 30) {
      spendingStyle = 'insufficient_data';
    } else if (savingsRate >= 0.2 && activeSavingGoalsCount > 0) {
      spendingStyle = 'goal_driven';
    } else if (expenseVolatilityScore >= 60) {
      spendingStyle = 'impulsive';
    } else if (
      monthlyExpenseTrend === 'increasing' &&
      monthlyIncomeTrend === 'stable'
    ) {
      spendingStyle = 'seasonal';
    } else if (
      averageMonthlyIncome > 0 &&
      Math.abs(averageMonthlyIncome - averageMonthlyExpense) <
        averageMonthlyIncome * 0.15
    ) {
      spendingStyle = 'income_driven';
    } else {
      spendingStyle = 'stable';
    }

    // 16. Preferred Budget Buffer Pct
    let buffer = 0.1;
    if (expenseVolatilityScore > 60) {
      buffer += 0.1;
    }
    if (budgetDisciplineScore < 60) {
      buffer += 0.05;
    }
    if (riskLevel === 'high') {
      buffer -= 0.05;
    }
    const preferredBudgetBufferPct = Math.max(0.05, Math.min(0.25, buffer));

    // 17. Confidence Score
    let confidence = 0;
    confidence += Math.min(40, activeMonths * 8);
    confidence += Math.min(30, transactionCount / 5);
    if (activePlan) {
      confidence += 15;
    }
    if (activeSavingGoalsCount > 0) {
      confidence += 15;
    }
    const confidenceScore = Math.max(0, Math.min(100, Math.round(confidence)));

    const feedbackSummary = await this.aiFeedbackService.getSummary(
      userId,
      undefined,
      'last_180_days',
    );
    const budgetFeedback = (feedbackSummary.budget || {}) as any;
    const categoryPreferences = Array.isArray(
      budgetFeedback.categoryPreferences,
    )
      ? budgetFeedback.categoryPreferences
      : [];
    const categoryCutResistance = categoryPreferences
      .filter((item: any) => item.count >= 2 && item.rejectionRate >= 0.5)
      .map((item: any) => ({
        categoryName: item.categoryName,
        resistance: item.rejectionRate >= 0.7 ? 'high' : 'medium',
        rejectionRate: item.rejectionRate,
      }));
    const averageModificationDeltaPct =
      typeof budgetFeedback.averageModificationDeltaPct === 'number'
        ? budgetFeedback.averageModificationDeltaPct
        : 0;
    const feedbackBufferAdjustment =
      (budgetFeedback.totalCount || 0) >= 3 && averageModificationDeltaPct > 0
        ? Math.min(0.05, averageModificationDeltaPct * 0.2)
        : 0;
    const adjustedPreferredBudgetBufferPct = Math.max(
      0.05,
      Math.min(0.25, preferredBudgetBufferPct + feedbackBufferAdjustment),
    );
    const adjustedConfidenceScore = Math.max(
      0,
      Math.min(
        100,
        confidenceScore + Math.min(5, (budgetFeedback.totalCount || 0) * 0.5),
      ),
    );
    const profileFeedbackSummary = {
      ...feedbackSummary,
      adaptivePreferences: {
        categoryCutResistance,
        preferredBudgetBufferAdjustmentPct: feedbackBufferAdjustment,
      },
    };

    // Save or update profile in DB
    let profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      profile = this.profileRepo.create({
        user,
        userId,
      });
    }

    profile.periodStart = periodStart;
    profile.periodEnd = periodEnd;
    profile.generatedAt = new Date();
    profile.averageMonthlyIncome = averageMonthlyIncome;
    profile.averageMonthlyExpense = averageMonthlyExpense;
    profile.averageMonthlySavings = averageMonthlySavings;
    profile.savingsRate = savingsRate;
    profile.expenseVolatilityScore = expenseVolatilityScore;
    profile.budgetDisciplineScore = budgetDisciplineScore;
    profile.financialHealthScore = financialHealthScore;
    profile.riskLevel = riskLevel;
    profile.spendingStyle = spendingStyle;
    profile.topExpenseCategories = topExpenseCategories;
    profile.essentialCategories = essentialCategories;
    profile.recurringExpenseHints = recurringExpenseHints;
    profile.frequentExpenseDays = frequentExpenseDays;
    profile.monthlyIncomeTrend = monthlyIncomeTrend;
    profile.monthlyExpenseTrend = monthlyExpenseTrend;
    profile.preferredBudgetBufferPct = adjustedPreferredBudgetBufferPct;
    profile.confidenceScore = adjustedConfidenceScore;
    profile.feedbackSummary = profileFeedbackSummary;
    profile.profileVersion = 'v1';

    return this.profileRepo.save(profile);
  }
}
