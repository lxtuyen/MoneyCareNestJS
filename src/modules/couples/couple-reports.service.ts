import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, Repository } from 'typeorm';
import { getVietnamMonthRange } from 'src/common/utils/date.util';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { CoupleBudget } from './entities/couple-budget.entity';
import { CoupleSavingGoal } from './entities/couple-saving-goal.entity';
import { CoupleMember } from './entities/couple-member.entity';
import { CoupleSpendingAlert } from './entities/couple-spending-alert.entity';
import { UpdateCoupleAlertDto } from './dto/couple-report.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';

type AlertDraft = Pick<
  CoupleSpendingAlert,
  | 'coupleId'
  | 'alertKey'
  | 'type'
  | 'severity'
  | 'title'
  | 'message'
  | 'transactionId'
  | 'categoryId'
  | 'amount'
>;

@Injectable()
export class CoupleReportsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(CoupleBudget)
    private readonly budgetRepo: Repository<CoupleBudget>,
    @InjectRepository(CoupleSavingGoal)
    private readonly savingGoalRepo: Repository<CoupleSavingGoal>,
    @InjectRepository(CoupleMember)
    private readonly coupleMemberRepo: Repository<CoupleMember>,
    @InjectRepository(CoupleSpendingAlert)
    private readonly alertRepo: Repository<CoupleSpendingAlert>,
  ) {}

  async getReport(
    requestUserId: number,
    coupleId: number,
    month: string,
  ): Promise<ApiResponse<any>> {
    await this.checkMembership(requestUserId, coupleId);

    const { start, end } = this.getMonthRange(month);
    const historyStart = new Date(start);
    historyStart.setMonth(historyStart.getMonth() - 6);

    const [transactions, historyTransactions, budgets, savingGoals, members] =
      await Promise.all([
        this.transactionRepo.find({
          where: {
            coupleId,
            transaction_date: Between(start, end),
          },
          relations: [
            'category',
            'payer',
            'payer.profile',
            'user',
            'user.profile',
          ],
          order: { transaction_date: 'DESC' },
        }),
        this.transactionRepo.find({
          where: {
            coupleId,
            transaction_date: Between(historyStart, end),
            type: 'expense',
          },
          relations: ['category'],
          order: { transaction_date: 'DESC' },
        }),
        this.budgetRepo.find({
          where: { coupleId, month },
          relations: ['category'],
        }),
        this.savingGoalRepo.find({
          where: { coupleId },
          order: { updatedAt: 'DESC' },
        }),
        this.coupleMemberRepo.find({
          where: { coupleId },
          relations: ['user', 'user.profile'],
        }),
      ]);

    const alerts = await this.syncAlerts(
      coupleId,
      month,
      transactions,
      historyTransactions,
      budgets,
    );

    const summary = this.buildSummary(transactions, month);
    const topCategories = this.buildTopCategories(transactions);
    const memberContributions = this.buildMemberContributions(
      transactions,
      members,
    );
    const budgetProgress = this.buildBudgetProgress(transactions, budgets);
    const savingProgress = savingGoals.map((goal) => ({
      id: goal.id,
      name: goal.name,
      target: Number(goal.target ?? 0),
      savedAmount: Number(goal.saved_amount ?? 0),
      progress:
        Number(goal.target ?? 0) > 0
          ? Math.min(
              100,
              (Number(goal.saved_amount ?? 0) / Number(goal.target)) * 100,
            )
          : 0,
      status: goal.status,
      endDate: goal.end_date,
    }));
    const weeklyTrend = this.buildWeeklyTrend(transactions, start);
    const insights = this.buildInsights({
      summary,
      topCategories,
      budgetProgress,
      savingProgress,
      alerts,
    });

    return ok({
      month,
      summary,
      topCategories,
      memberContributions,
      budgetProgress,
      savingProgress,
      weeklyTrend,
      insights,
      alerts: alerts.map((alert) => this.mapAlert(alert)),
      unreadAlertCount: alerts.filter((alert) => !alert.isRead).length,
    });
  }

  async markAlertRead(
    requestUserId: number,
    id: number,
  ): Promise<ApiResponse<any>> {
    const alert = await this.findAlertForMember(requestUserId, id);
    alert.isRead = true;
    const saved = await this.alertRepo.save(alert);
    return ok(this.mapAlert(saved));
  }

  async updateAlert(
    requestUserId: number,
    id: number,
    dto: UpdateCoupleAlertDto,
  ): Promise<ApiResponse<any>> {
    const alert = await this.findAlertForMember(requestUserId, id);
    if (dto.status) {
      alert.status = dto.status;
      alert.isRead = true;
    }
    if (dto.feedback) {
      alert.feedback = dto.feedback;
      alert.feedbackById = requestUserId;
      alert.feedbackAt = new Date();
      alert.isRead = true;
      if (dto.feedback === 'ignored') {
        alert.status = 'dismissed';
      }
    }
    const saved = await this.alertRepo.save(alert);
    return ok(this.mapAlert(saved));
  }

  private async checkMembership(
    userId: number,
    coupleId: number,
  ): Promise<void> {
    const membership = await this.coupleMemberRepo.findOne({
      where: { userId, coupleId },
    });
    if (!membership) {
      throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
    }
  }

  private async findAlertForMember(userId: number, id: number) {
    const alert = await this.alertRepo.findOne({
      where: { id },
      relations: ['category', 'transaction'],
    });
    if (!alert) {
      throw new NotFoundException('Không tìm thấy cảnh báo.');
    }
    await this.checkMembership(userId, alert.coupleId);
    return alert;
  }

  private getMonthRange(month: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    return getVietnamMonthRange(monthNumber, year);
  }

  private buildSummary(transactions: Transaction[], month: string) {
    const totalIncome = this.sum(
      transactions.filter((transaction) => transaction.type === 'income'),
    );
    const totalExpense = this.sum(
      transactions.filter((transaction) => transaction.type === 'expense'),
    );
    return {
      month,
      totalIncome,
      totalExpense,
      netBalance: totalIncome - totalExpense,
      transactionCount: transactions.length,
      expenseCount: transactions.filter((item) => item.type === 'expense')
        .length,
    };
  }

  private buildTopCategories(transactions: Transaction[]) {
    const expenses = transactions.filter((item) => item.type === 'expense');
    const totalExpense = this.sum(expenses);
    const grouped = new Map<
      number,
      {
        categoryId: number;
        categoryName: string;
        categoryIcon: string;
        amount: number;
      }
    >();

    for (const transaction of expenses) {
      const categoryId = transaction.category?.id ?? 0;
      const current = grouped.get(categoryId) ?? {
        categoryId,
        categoryName: transaction.category?.name ?? 'Khác',
        categoryIcon: transaction.category?.icon ?? '💰',
        amount: 0,
      };
      current.amount += Number(transaction.amount);
      grouped.set(categoryId, current);
    }

    return Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        percentage: totalExpense > 0 ? (item.amount / totalExpense) * 100 : 0,
      }));
  }

  private buildMemberContributions(
    transactions: Transaction[],
    members: CoupleMember[],
  ) {
    const paidByUser = new Map<number, number>();
    for (const transaction of transactions) {
      if (transaction.type !== 'expense') continue;
      const payerId = transaction.payerId ?? transaction.user?.id;
      if (!payerId) continue;
      paidByUser.set(
        payerId,
        (paidByUser.get(payerId) ?? 0) + Number(transaction.amount),
      );
    }

    return members.map((member) => ({
      userId: member.userId,
      fullName: this.getUserName(member),
      paidAmount: paidByUser.get(member.userId) ?? 0,
    }));
  }

  private buildBudgetProgress(
    transactions: Transaction[],
    budgets: CoupleBudget[],
  ) {
    return budgets.map((budget) => {
      const spentAmount = this.sum(
        transactions.filter(
          (transaction) =>
            transaction.type === 'expense' &&
            transaction.category?.id === budget.categoryId,
        ),
      );
      const amount = Number(budget.amount);
      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category?.name ?? 'Khác',
        categoryIcon: budget.category?.icon ?? '💰',
        amount,
        spentAmount,
        remainingAmount: Math.max(0, amount - spentAmount),
        usagePercentage: amount > 0 ? (spentAmount / amount) * 100 : 0,
      };
    });
  }

  private buildWeeklyTrend(transactions: Transaction[], monthStart: Date) {
    const weeks = Array.from({ length: 5 }).map((_, index) => ({
      weekIndex: index + 1,
      income: 0,
      expense: 0,
    }));

    for (const transaction of transactions) {
      const dayDiff = Math.floor(
        (transaction.transaction_date.getTime() - monthStart.getTime()) /
          (24 * 60 * 60 * 1000),
      );
      const weekIndex = Math.min(4, Math.max(0, Math.floor(dayDiff / 7)));
      if (transaction.type === 'income') {
        weeks[weekIndex].income += Number(transaction.amount);
      } else {
        weeks[weekIndex].expense += Number(transaction.amount);
      }
    }
    return weeks;
  }

  private buildInsights(input: {
    summary: any;
    topCategories: any[];
    budgetProgress: any[];
    savingProgress: any[];
    alerts: CoupleSpendingAlert[];
  }) {
    const insights: Array<{
      title: string;
      message: string;
      severity: 'info' | 'warning' | 'danger' | 'success';
      evidence: string;
    }> = [];

    const overBudget = input.budgetProgress.filter(
      (budget) => budget.usagePercentage >= 100,
    );
    if (overBudget.length > 0) {
      insights.push({
        title: 'Ngân sách chung có rủi ro vượt mức',
        message: `${overBudget.length} danh mục đã vượt ngân sách tháng này.`,
        severity: 'danger',
        evidence: overBudget.map((budget) => budget.categoryName).join(', '),
      });
    }

    const topCategory = input.topCategories[0];
    if (topCategory) {
      insights.push({
        title: 'Danh mục chi chung lớn nhất',
        message: `${topCategory.categoryName} đang chiếm ${topCategory.percentage.toFixed(0)}% tổng chi chung.`,
        severity: topCategory.percentage >= 50 ? 'warning' : 'info',
        evidence: `${Math.round(topCategory.amount).toLocaleString('vi-VN')} VND`,
      });
    }

    const unfinishedGoals = input.savingProgress.filter(
      (goal) => goal.status !== 'completed',
    );
    if (unfinishedGoals.length > 0) {
      insights.push({
        title: 'Tiến độ quỹ tiết kiệm chung',
        message: `Hai bạn đang theo dõi ${unfinishedGoals.length} quỹ tiết kiệm chung chưa hoàn thành.`,
        severity: 'info',
        evidence: unfinishedGoals.map((goal) => goal.name).join(', '),
      });
    }

    if (input.summary.netBalance >= 0) {
      insights.push({
        title: 'Dòng tiền chung đang dương',
        message: 'Tổng thu chung đang lớn hơn tổng chi trong tháng.',
        severity: 'success',
        evidence: `${Math.round(input.summary.netBalance).toLocaleString('vi-VN')} VND`,
      });
    } else {
      insights.push({
        title: 'Dòng tiền chung đang âm',
        message: 'Tổng chi chung đang cao hơn tổng thu trong tháng.',
        severity: 'warning',
        evidence: `${Math.round(Math.abs(input.summary.netBalance)).toLocaleString('vi-VN')} VND`,
      });
    }

    if (input.alerts.some((alert) => alert.severity === 'high')) {
      insights.push({
        title: 'Có cảnh báo chi tiêu mức cao',
        message:
          'Nên rà soát các cảnh báo trước khi tạo thêm chi tiêu chung mới.',
        severity: 'danger',
        evidence: `${input.alerts.filter((alert) => alert.severity === 'high').length} cảnh báo mức cao`,
      });
    }

    return insights;
  }

  private async syncAlerts(
    coupleId: number,
    month: string,
    transactions: Transaction[],
    historyTransactions: Transaction[],
    budgets: CoupleBudget[],
  ): Promise<CoupleSpendingAlert[]> {
    const drafts = this.buildAlertDrafts(
      coupleId,
      month,
      transactions,
      historyTransactions,
      budgets,
    );

    for (const draft of drafts) {
      const existing = await this.alertRepo.findOne({
        where: { coupleId, alertKey: draft.alertKey },
      });
      if (existing) continue;
      await this.alertRepo.save(this.alertRepo.create(draft));
    }

    return this.alertRepo.find({
      where: {
        coupleId,
        createdAt: LessThanOrEqual(new Date()),
      },
      relations: ['category', 'transaction'],
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  private buildAlertDrafts(
    coupleId: number,
    month: string,
    transactions: Transaction[],
    historyTransactions: Transaction[],
    budgets: CoupleBudget[],
  ): AlertDraft[] {
    const drafts: AlertDraft[] = [];
    const expenses = transactions.filter((item) => item.type === 'expense');
    const categoryStats = this.buildCategoryStats(historyTransactions);

    for (const transaction of expenses) {
      const categoryId = transaction.category?.id ?? 0;
      const stats = categoryStats.get(categoryId);
      if (!stats || stats.count < 3) continue;
      const threshold = Math.max(
        stats.average * 2.5,
        stats.average + stats.stdDev * 2,
      );
      if (Number(transaction.amount) > threshold) {
        drafts.push({
          coupleId,
          alertKey: `large-tx:${transaction.id}`,
          type: 'large_transaction',
          severity:
            Number(transaction.amount) > threshold * 1.5 ? 'high' : 'medium',
          title: 'Giao dịch chung lớn bất thường',
          message: `${transaction.category?.name ?? 'Danh mục'} cao hơn mức thường thấy của cặp đôi.`,
          transactionId: transaction.id,
          categoryId: transaction.category?.id ?? null,
          amount: Number(transaction.amount),
        });
      }
    }

    for (const budget of budgets) {
      const spent = this.sum(
        expenses.filter((item) => item.category?.id === budget.categoryId),
      );
      const amount = Number(budget.amount);
      if (amount > 0 && spent > amount) {
        drafts.push({
          coupleId,
          alertKey: `budget-exceeded:${month}:${budget.categoryId}`,
          type: 'budget_exceeded',
          severity: spent / amount >= 1.25 ? 'high' : 'medium',
          title: 'Danh mục vượt ngân sách chung',
          message: `${budget.category?.name ?? 'Danh mục'} đã vượt ngân sách tháng ${month}.`,
          transactionId: null,
          categoryId: budget.categoryId,
          amount: spent - amount,
        });
      }
    }

    const byDayAndCategory = new Map<string, Transaction[]>();
    for (const transaction of expenses) {
      if (Number(transaction.amount) > 100000) continue;
      const day = transaction.transaction_date.toISOString().slice(0, 10);
      const key = `${day}:${transaction.category?.id ?? 0}`;
      const list = byDayAndCategory.get(key) ?? [];
      list.push(transaction);
      byDayAndCategory.set(key, list);
    }
    for (const [key, list] of byDayAndCategory.entries()) {
      if (list.length < 3) continue;
      const [day] = key.split(':');
      drafts.push({
        coupleId,
        alertKey: `small-repeat:${key}`,
        type: 'repeated_small_transactions',
        severity: 'low',
        title: 'Nhiều giao dịch nhỏ liên tiếp',
        message: `Có ${list.length} giao dịch nhỏ trong cùng ngày ${day}.`,
        transactionId: list[0].id,
        categoryId: list[0].category?.id ?? null,
        amount: this.sum(list),
      });
    }

    return drafts;
  }

  private buildCategoryStats(transactions: Transaction[]) {
    const grouped = new Map<number, number[]>();
    for (const transaction of transactions) {
      const categoryId = transaction.category?.id ?? 0;
      const list = grouped.get(categoryId) ?? [];
      list.push(Number(transaction.amount));
      grouped.set(categoryId, list);
    }

    const stats = new Map<
      number,
      { count: number; average: number; stdDev: number }
    >();
    for (const [categoryId, values] of grouped.entries()) {
      const average =
        values.reduce((sum, amount) => sum + amount, 0) / values.length;
      const variance =
        values.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) /
        values.length;
      stats.set(categoryId, {
        count: values.length,
        average,
        stdDev: Math.sqrt(variance),
      });
    }
    return stats;
  }

  private mapAlert(alert: CoupleSpendingAlert) {
    return {
      id: alert.id,
      coupleId: alert.coupleId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      transactionId: alert.transactionId,
      categoryId: alert.categoryId,
      categoryName: alert.category?.name ?? null,
      categoryIcon: alert.category?.icon ?? null,
      amount: Number(alert.amount ?? 0),
      isRead: alert.isRead,
      status: alert.status,
      feedback: alert.feedback,
      createdAt: alert.createdAt,
    };
  }

  private getUserName(member: CoupleMember): string {
    return (
      [member.user?.profile?.first_name, member.user?.profile?.last_name]
        .filter(Boolean)
        .join(' ') ||
      member.user?.email ||
      `User ${member.userId}`
    );
  }

  private sum(transactions: Transaction[]): number {
    return transactions.reduce(
      (total, transaction) => total + Number(transaction.amount),
      0,
    );
  }
}
