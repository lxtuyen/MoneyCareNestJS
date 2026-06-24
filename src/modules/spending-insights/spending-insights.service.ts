import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { RecurringTransaction } from './entities/recurring-transaction.entity';
import { RecurringDetectResponseDto } from './dto/recurring-transactions.dto';
import { ConfirmRecurringDto, DismissRecurringDto } from './dto/confirm-recurring.dto';
import { RecurringCacheService } from 'src/common/cache/recurring-cache.service';

@Injectable()
export class SpendingInsightsService {
  private readonly logger = new Logger(SpendingInsightsService.name);

  /** Tracks in-flight revalidation per user to avoid duplicate calls */
  private readonly revalidating = new Set<number>();

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    @InjectRepository(RecurringTransaction)
    private readonly recurringRepo: Repository<RecurringTransaction>,
    private readonly configService: ConfigService,
    private readonly recurringCacheService: RecurringCacheService,
  ) {}

  async getRecurringTransactions(
    userId: number,
    months: number = 6,
    minConfidence: number = 0.5,
    forceRefresh: boolean = false,
  ): Promise<RecurringDetectResponseDto> {
    // ── 1. Skip cache if force refresh ──
    if (!forceRefresh) {
      // Try fresh cache first
      const freshEntry = await this.recurringCacheService.getFresh(userId);
      if (freshEntry) {
        this.logger.debug(`Recurring cache HIT (fresh) for userId=${userId}`);
        return { ...freshEntry.data, lastScannedAt: freshEntry.scannedAt };
      }

      // Try stale cache (SWR)
      const staleEntry = await this.recurringCacheService.getStale(userId);
      if (staleEntry) {
        this.logger.debug(
          `Recurring cache HIT (stale) for userId=${userId}, triggering background revalidation`,
        );
        this.revalidateInBackground(userId, months, minConfidence);
        return { ...staleEntry.data, lastScannedAt: staleEntry.scannedAt };
      }
    }

    // ── 2. Cache miss — fetch synchronously ──
    this.logger.debug(`Recurring cache MISS for userId=${userId}, fetching from analytics-service`);
    const result = await this.fetchAndCache(userId, months, minConfidence);
    return result;
  }

  /**
   * Invalidate recurring cache for a user.
   * Called from TransactionsService when expense (non-transfer) changes.
   */
  async invalidateRecurringCache(userId: number): Promise<void> {
    await this.recurringCacheService.invalidate(userId);
  }

  // ── Private: fetch from analytics-service and cache ──

  private async fetchAndCache(
    userId: number,
    months: number,
    minConfidence: number,
  ): Promise<RecurringDetectResponseDto> {
    // 1. Query transactions
    const sinceDate = new Date();
    sinceDate.setMonth(sinceDate.getMonth() - months);

    const transactions = await this.transactionRepo.find({
      where: {
        user: { id: userId },
        type: 'expense',
        isTransfer: false,
        transaction_date: MoreThan(sinceDate),
      },
      relations: ['category'],
      order: { transaction_date: 'ASC' },
    });

    if (transactions.length < 3) {
      const emptyResult: RecurringDetectResponseDto = {
        recurringItems: [],
        totalMonthlyRecurring: 0,
        scanMonths: months,
        transactionCount: 0,
        lastScannedAt: new Date().toISOString(),
      };
      // Cache empty result để lần sau không query DB lại
      await this.recurringCacheService.set(userId, emptyResult);
      return emptyResult;
    }

    // 2. Map to analytics-service format
    const txPayload = transactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      transaction_date:
        t.transaction_date instanceof Date
          ? t.transaction_date.toISOString()
          : String(t.transaction_date),
      type: t.type,
      category: t.category ? { name: t.category.name, icon: t.category.icon } : null,
      note: t.note || '',
      is_transfer: t.isTransfer,
    }));

    // 3. Call analytics-service
    const rawResult = await this.callRecurringDetect(txPayload, userId, minConfidence);

    // 4. Map snake_case response → camelCase DTO
    const mapped = this.mapResponse(rawResult);

    // 5. Filter out dismissed AND confirmed items from detected list
    const existingRecurring = await this.recurringRepo.find({
      where: { user: { id: userId } },
    });
    const excludedIds = new Set(
      existingRecurring
        .filter((r) => r.status === 'dismissed' || r.status === 'confirmed')
        .map((r) => r.aiRecurringId),
    );

    if (excludedIds.size > 0) {
      mapped.recurringItems = mapped.recurringItems.filter(
        (item) => !excludedIds.has(item.recurringId),
      );
      mapped.totalMonthlyRecurring = mapped.recurringItems.reduce(
        (sum, item) => sum + (item.monthlyEstimate || 0),
        0,
      );
    }

    // 6. Cache result
    await this.recurringCacheService.set(userId, mapped);
    mapped.lastScannedAt = new Date().toISOString();

    return mapped;
  }

  /**
   * Revalidate cache in the background (SWR).
   * Prevents duplicate in-flight requests for the same user.
   */
  private revalidateInBackground(
    userId: number,
    months: number,
    minConfidence: number,
  ): void {
    if (this.revalidating.has(userId)) {
      return; // Already revalidating for this user
    }

    this.revalidating.add(userId);

    setImmediate(() => {
      this.fetchAndCache(userId, months, minConfidence)
        .then(() => {
          this.logger.debug(
            `Background revalidation completed for userId=${userId}`,
          );
        })
        .catch((error) => {
          this.logger.warn(
            `Background revalidation failed for userId=${userId}: ${error.message}`,
          );
        })
        .finally(() => {
          this.revalidating.delete(userId);
        });
    });
  }

  private async callRecurringDetect(
    transactions: any[],
    userId: number,
    minConfidence: number,
  ): Promise<any> {
    const url =
      this.configService.get<string>('ANALYTICS_SERVICE_URL') ||
      'http://localhost:8000';
    const apiKey =
      this.configService.get<string>('ANALYTICS_SERVICE_API_KEY') || '';
    const timeoutMs = Number(
      this.configService.get<number>('ANALYTICS_SERVICE_TIMEOUT_MS') || 10000,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      this.logger.warn(
        `Recurring detect request timed out after ${timeoutMs}ms`,
      );
    }, timeoutMs);

    try {
      this.logger.log(
        `Calling analytics-service recurring-detect: userId=${userId}, ${transactions.length} transactions`,
      );

      const response = await fetch(`${url}/v1/financial/recurring-detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          user_id: userId,
          transactions,
          min_confidence: minConfidence,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Analytics service error: status=${response.status}, body=${errorText.substring(0, 500)}`,
        );
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(
          `Recurring detect request timed out after ${timeoutMs}ms`,
        );
      }

      this.logger.error(`Error calling recurring-detect: ${error.message}`);
      throw error;
    }
  }

  private mapResponse(raw: any): RecurringDetectResponseDto {
    const items = (raw.recurring_items || []).map((item: any) => ({
      recurringId: item.recurring_id,
      categoryName: item.category_name,
      categoryIcon: item.category_icon,
      description: item.description,
      averageAmount: item.average_amount,
      frequency: item.frequency,
      confidence: item.confidence,
      lastOccurrence: item.last_occurrence,
      nextExpectedDate: item.next_expected_date,
      occurrenceCount: item.occurrence_count,
      totalSpent: item.total_spent,
      monthlyEstimate: item.monthly_estimate,
      amountTrend: item.amount_trend,
      recentTransactions: (item.recent_transactions || []).map((tx: any) => ({
        id: tx.id,
        amount: tx.amount,
        date: tx.date,
        note: tx.note,
      })),
    }));

    return {
      recurringItems: items,
      totalMonthlyRecurring: raw.total_monthly_recurring || 0,
      scanMonths: raw.scan_months || 0,
      transactionCount: raw.transaction_count || 0,
    };
  }

  // ── Confirm / Dismiss / List ──────────────────────────

  async confirmRecurring(
    userId: number,
    dto: ConfirmRecurringDto,
  ): Promise<RecurringTransaction> {
    // Upsert: nếu đã tồn tại thì update status
    const existing = await this.recurringRepo.findOne({
      where: { user: { id: userId }, aiRecurringId: dto.aiRecurringId },
    });

    if (existing) {
      existing.status = 'confirmed';
      existing.averageAmount = dto.averageAmount;
      existing.monthlyEstimate = dto.monthlyEstimate;
      existing.frequency = dto.frequency;
      existing.description = dto.description;
      existing.categoryName = dto.categoryName;
      existing.categoryIcon = dto.categoryIcon || existing.categoryIcon;
      existing.expectedDay = dto.expectedDay || existing.expectedDay;
      return this.recurringRepo.save(existing);
    }

    const entity = this.recurringRepo.create({
      user: { id: userId } as any,
      description: dto.description,
      categoryName: dto.categoryName,
      categoryIcon: dto.categoryIcon || '',
      averageAmount: dto.averageAmount,
      frequency: dto.frequency,
      monthlyEstimate: dto.monthlyEstimate,
      expectedDay: dto.expectedDay,
      status: 'confirmed',
      aiRecurringId: dto.aiRecurringId,
    });

    return this.recurringRepo.save(entity);
  }

  async dismissRecurring(
    userId: number,
    dto: DismissRecurringDto,
  ): Promise<void> {
    const existing = await this.recurringRepo.findOne({
      where: { user: { id: userId }, aiRecurringId: dto.aiRecurringId },
    });

    if (existing) {
      existing.status = 'dismissed';
      await this.recurringRepo.save(existing);
    } else {
      const entity = this.recurringRepo.create({
        user: { id: userId } as any,
        description: '',
        categoryName: '',
        averageAmount: 0,
        frequency: '',
        monthlyEstimate: 0,
        status: 'dismissed',
        aiRecurringId: dto.aiRecurringId,
      });
      await this.recurringRepo.save(entity);
    }
  }

  async getConfirmedRecurring(userId: number): Promise<RecurringTransaction[]> {
    return this.recurringRepo.find({
      where: { user: { id: userId }, status: 'confirmed' },
      order: { monthlyEstimate: 'DESC' },
    });
  }

  async updateConfirmedRecurring(
    userId: number,
    id: number,
    updates: { averageAmount?: number; expectedDay?: number; monthlyEstimate?: number },
  ): Promise<RecurringTransaction> {
    const record = await this.recurringRepo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!record) {
      throw new Error('Recurring transaction not found');
    }

    if (updates.averageAmount !== undefined) {
      record.averageAmount = updates.averageAmount;
    }
    if (updates.expectedDay !== undefined) {
      record.expectedDay = updates.expectedDay;
    }
    if (updates.monthlyEstimate !== undefined) {
      record.monthlyEstimate = updates.monthlyEstimate;
    }

    await this.recurringRepo.save(record);

    // Invalidate cache
    await this.recurringCacheService.invalidate(userId);

    return record;
  }

  async deleteConfirmedRecurring(userId: number, id: number): Promise<void> {
    const record = await this.recurringRepo.findOne({
      where: { id, user: { id: userId } },
    });
    if (!record) {
      throw new Error('Recurring transaction not found');
    }

    await this.recurringRepo.remove(record);

    // Invalidate cache so AI can re-detect this item
    await this.recurringCacheService.invalidate(userId);
  }
}
