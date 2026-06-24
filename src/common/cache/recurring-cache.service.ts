import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Dedicated cache service for recurring detection results.
 * Lives in common/cache to avoid circular dependency between
 * TransactionsModule and SpendingInsightsModule.
 *
 * Strategy: Stale-While-Revalidate (SWR)
 * - Fresh cache (TTL 30min): return immediately
 * - Stale cache (TTL 2h): return stale data + trigger background revalidation
 * - No cache: caller must fetch synchronously
 */

export interface RecurringCacheEntry {
  /** The cached response data (camelCase DTO shape) */
  data: any;
  /** ISO timestamp when DBSCAN last completed */
  scannedAt: string;
}

const RECURRING_FRESH_TTL = 1800; // 30 minutes
const RECURRING_STALE_TTL = 7200; // 2 hours

@Injectable()
export class RecurringCacheService {
  private readonly logger = new Logger(RecurringCacheService.name);

  constructor(private readonly cacheService: CacheService) {}

  private freshKey(userId: number): string {
    return `recurring:detect:${userId}`;
  }

  private staleKey(userId: number): string {
    return `recurring:detect:${userId}:stale`;
  }

  /**
   * Get fresh cached result (within 30min TTL).
   */
  async getFresh(userId: number): Promise<RecurringCacheEntry | null> {
    return this.cacheService.get<RecurringCacheEntry>(this.freshKey(userId));
  }

  /**
   * Get stale cached result (within 2h TTL).
   * Used for SWR when fresh cache has expired.
   */
  async getStale(userId: number): Promise<RecurringCacheEntry | null> {
    return this.cacheService.get<RecurringCacheEntry>(this.staleKey(userId));
  }

  /**
   * Store result in both fresh and stale caches.
   */
  async set(userId: number, data: any): Promise<void> {
    const entry: RecurringCacheEntry = {
      data,
      scannedAt: new Date().toISOString(),
    };

    await Promise.all([
      this.cacheService.set(this.freshKey(userId), entry, RECURRING_FRESH_TTL),
      this.cacheService.set(this.staleKey(userId), entry, RECURRING_STALE_TTL),
    ]);

    this.logger.debug(`Cached recurring result for userId=${userId}`);
  }

  /**
   * Invalidate fresh cache for a user, keeping stale data for SWR.
   * Next request will return stale data instantly + revalidate in background.
   * Called when user creates/updates/deletes an expense transaction.
   */
  async invalidate(userId: number): Promise<void> {
    // Chỉ xóa fresh cache → lần sau vào SWR flow (trả stale + revalidate nền)
    await this.cacheService.del(this.freshKey(userId));

    this.logger.debug(`Invalidated recurring fresh cache for userId=${userId}`);
  }
}
