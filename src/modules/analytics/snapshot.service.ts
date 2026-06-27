import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual } from 'typeorm';
import { MonthlyAnalyticsSnapshot } from './entities/monthly-analytics-snapshot.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { getVietnamMonthRange } from 'src/common/utils/date.util';

export interface DeltaUpdate {
  incomeChange: number;
  expenseChange: number;
  category: string;
  type: 'income' | 'expense';
  countChange: number; // +1 (create) or -1 (delete)
}

export interface AnomalyResult {
  type: string;
  message: string;
  zScore: number;
  categoryMean: number;
}

@Injectable()
export class SnapshotService {
  private readonly logger = new Logger(SnapshotService.name);

  constructor(
    @InjectRepository(MonthlyAnalyticsSnapshot)
    private readonly snapshotRepo: Repository<MonthlyAnalyticsSnapshot>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  // ─── Get or Create snapshot for a specific month ────────────────

  async getOrCreateSnapshot(
    userId: number,
    month: number,
    year: number,
  ): Promise<MonthlyAnalyticsSnapshot> {
    let snapshot = await this.snapshotRepo.findOne({
      where: { userId, month, year },
    });

    if (!snapshot) {
      snapshot = this.snapshotRepo.create({
        userId,
        month,
        year,
        totalIncome: 0,
        totalExpense: 0,
        transactionCount: 0,
        categoryExpenses: {},
        categoryIncomes: {},
      });
      snapshot = await this.snapshotRepo.save(snapshot);
      this.logger.log(
        `Created new snapshot for user ${userId}: ${month}/${year}`,
      );
    }

    return snapshot;
  }

  // ─── Delta update khi tạo/sửa/xóa giao dịch ───────────────────

  async applyDelta(
    userId: number,
    month: number,
    year: number,
    delta: DeltaUpdate,
  ): Promise<void> {
    const snapshot = await this.getOrCreateSnapshot(userId, month, year);

    if (delta.type === 'expense') {
      snapshot.totalExpense =
        Number(snapshot.totalExpense) + delta.expenseChange;
      const current = snapshot.categoryExpenses[delta.category] || 0;
      snapshot.categoryExpenses = {
        ...snapshot.categoryExpenses,
        [delta.category]: current + delta.expenseChange,
      };
    } else {
      snapshot.totalIncome = Number(snapshot.totalIncome) + delta.incomeChange;
      const current = snapshot.categoryIncomes[delta.category] || 0;
      snapshot.categoryIncomes = {
        ...snapshot.categoryIncomes,
        [delta.category]: current + delta.incomeChange,
      };
    }

    snapshot.transactionCount += delta.countChange;

    // Invalidate AI cache — force recompute on next read
    snapshot.aiComputedAt = null;

    await this.snapshotRepo.save(snapshot);
  }

  async saveAiResults(
    snapshot: MonthlyAnalyticsSnapshot,
    aiData: {
      healthScore: number | null;
      cashFlowTrend: string | null;
      forecastData: any | null;
      budgetingData: any | null;
      anomalies: any[] | null;
      insights: any[] | null;
    },
  ): Promise<void> {
    snapshot.healthScore = aiData.healthScore;
    snapshot.cashFlowTrend = aiData.cashFlowTrend;
    snapshot.forecastData = aiData.forecastData;
    snapshot.budgetingData = aiData.budgetingData;
    snapshot.anomalies = aiData.anomalies;
    snapshot.insights = aiData.insights;
    snapshot.aiComputedAt = new Date();
    await this.snapshotRepo.save(snapshot);
  }

  // ─── Lấy N tháng snapshots gần nhất ────────────────────────────

  async getRecentSnapshots(
    userId: number,
    count: number,
  ): Promise<MonthlyAnalyticsSnapshot[]> {
    return this.snapshotRepo.find({
      where: { userId },
      order: { year: 'DESC', month: 'DESC' },
      take: count,
    });
  }

  // ─── Lấy snapshot completed gần nhất (cho anomaly detection) ───

  async getLastCompletedSnapshot(
    userId: number,
  ): Promise<MonthlyAnalyticsSnapshot | null> {
    return this.snapshotRepo.findOne({
      where: { userId, isCompleted: true },
      order: { year: 'DESC', month: 'DESC' },
    });
  }

  // ─── Check anomaly cho giao dịch mới ───────────────────────────

  async checkAnomaly(
    userId: number,
    amount: number,
    categoryName: string,
  ): Promise<AnomalyResult | null> {
    const baseline = await this.getLastCompletedSnapshot(userId);
    if (!baseline?.categoryStats) return null;

    const stats = baseline.categoryStats[categoryName];
    if (!stats || stats.count < 3) return null; // Chưa đủ data

    // Tránh chia cho 0
    if (stats.stdDev === 0) {
      // Nếu tất cả giao dịch cùng số tiền, chỉ cảnh báo nếu chênh lệch > 50%
      if (Math.abs(amount - stats.mean) > stats.mean * 0.5) {
        return {
          type: 'unusual_amount',
          message: `Giao dịch ${categoryName} khác biệt đáng kể so với trước`,
          zScore: 3,
          categoryMean: stats.mean,
        };
      }
      return null;
    }

    // Z-score: (giá trị - trung bình) / độ lệch chuẩn
    const zScore = (amount - stats.mean) / stats.stdDev;

    if (Math.abs(zScore) > 2.5) {
      const direction = zScore > 0 ? 'cao' : 'thấp';
      return {
        type: 'unusual_amount',
        message: `Giao dịch ${categoryName} ${direction} bất thường so với trước`,
        zScore,
        categoryMean: stats.mean,
      };
    }

    return null;
  }

  // ─── Đóng tháng: tính categoryStats + gọi FastAPI ──────────────

  async closeMonth(
    userId: number,
    month: number,
    year: number,
  ): Promise<MonthlyAnalyticsSnapshot> {
    const snapshot = await this.getOrCreateSnapshot(userId, month, year);

    if (snapshot.isCompleted) {
      this.logger.log(
        `Snapshot ${month}/${year} for user ${userId} already completed`,
      );
      return snapshot;
    }

    // Tính category stats (mean, stdDev) từ transactions của tháng
    const { start, end } = getVietnamMonthRange(month, year);
    const transactions = await this.transactionRepo.find({
      where: {
        user: { id: userId },
        transaction_date: Between(start, end),
        isTransfer: false,
      },
      relations: ['category'],
    });

    // Nhóm giao dịch theo category
    const categoryGroups: Record<string, number[]> = {};
    for (const tx of transactions) {
      const catName = tx.category?.name || 'Khác';
      if (!categoryGroups[catName]) {
        categoryGroups[catName] = [];
      }
      categoryGroups[catName].push(Number(tx.amount));
    }

    // Tính mean + stdDev
    const categoryStats: Record<
      string,
      { mean: number; stdDev: number; count: number }
    > = {};

    for (const [catName, amounts] of Object.entries(categoryGroups)) {
      const count = amounts.length;
      const mean = amounts.reduce((s, a) => s + a, 0) / count;
      const variance =
        amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / count;
      const stdDev = Math.sqrt(variance);

      categoryStats[catName] = { mean, stdDev, count };
    }

    snapshot.categoryStats = categoryStats;
    snapshot.isCompleted = true;

    await this.snapshotRepo.save(snapshot);

    this.logger.log(
      `Closed snapshot ${month}/${year} for user ${userId}: ${transactions.length} transactions, ${Object.keys(categoryStats).length} categories`,
    );

    return snapshot;
  }

  // ─── Migration: tạo snapshots từ data hiện có ──────────────────

  async migrateUserSnapshots(userId: number): Promise<number> {
    // Lấy tất cả transactions (không phải transfer)
    const transactions = await this.transactionRepo.find({
      where: { user: { id: userId }, isTransfer: false },
      relations: ['category'],
      order: { transaction_date: 'ASC' },
    });

    if (transactions.length === 0) return 0;

    // Nhóm theo tháng/năm
    const monthGroups = new Map<
      string,
      { month: number; year: number; txns: Transaction[] }
    >();

    for (const tx of transactions) {
      const d = new Date(tx.transaction_date);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const key = `${y}-${m}`;

      if (!monthGroups.has(key)) {
        monthGroups.set(key, { month: m, year: y, txns: [] });
      }
      monthGroups.get(key)!.txns.push(tx);
    }

    // Tháng hiện tại không nên đóng (isCompleted = false)
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${now.getMonth() + 1}`;

    let count = 0;
    for (const [key, group] of monthGroups) {
      const isCurrentMonth = key === currentKey;

      // Check xem đã có snapshot chưa
      const existing = await this.snapshotRepo.findOne({
        where: { userId, month: group.month, year: group.year },
      });
      if (existing) continue;

      // Tính aggregates
      let totalIncome = 0;
      let totalExpense = 0;
      const categoryExpenses: Record<string, number> = {};
      const categoryIncomes: Record<string, number> = {};
      const categoryGroups: Record<string, number[]> = {};

      for (const tx of group.txns) {
        const catName = tx.category?.name || 'Khác';
        const amount = Number(tx.amount);

        if (tx.type === 'expense') {
          totalExpense += amount;
          categoryExpenses[catName] = (categoryExpenses[catName] || 0) + amount;
        } else {
          totalIncome += amount;
          categoryIncomes[catName] = (categoryIncomes[catName] || 0) + amount;
        }

        if (!categoryGroups[catName]) categoryGroups[catName] = [];
        categoryGroups[catName].push(amount);
      }

      // Tính category stats
      const categoryStats: Record<
        string,
        { mean: number; stdDev: number; count: number }
      > = {};

      for (const [catName, amounts] of Object.entries(categoryGroups)) {
        const cnt = amounts.length;
        const mean = amounts.reduce((s, a) => s + a, 0) / cnt;
        const variance =
          amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / cnt;
        categoryStats[catName] = {
          mean,
          stdDev: Math.sqrt(variance),
          count: cnt,
        };
      }

      const snapshot = this.snapshotRepo.create({
        userId,
        month: group.month,
        year: group.year,
        totalIncome,
        totalExpense,
        transactionCount: group.txns.length,
        categoryExpenses,
        categoryIncomes,
        categoryStats,
        isCompleted: !isCurrentMonth,
      });

      await this.snapshotRepo.save(snapshot);
      count++;
    }

    this.logger.log(
      `Migrated ${count} snapshots for user ${userId}`,
    );

    return count;
  }
}
