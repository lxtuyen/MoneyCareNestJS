import { Injectable } from '@nestjs/common';
import { CacheService } from './cache.service';
import {
  getAiAnalysisRegistryKeys,
  getFinancialCacheKeys,
} from './financial-cache.util';

@Injectable()
export class FinancialCacheInvalidationService {
  constructor(private readonly cacheService: CacheService) {}

  async invalidate(userId: number, goalIds: number[]): Promise<void> {
    const scopedGoalIds = [0, ...goalIds];
    const keys = getFinancialCacheKeys(userId, scopedGoalIds);
    await this.cacheService.delMany(keys);

    const registryKeys = getAiAnalysisRegistryKeys(userId, scopedGoalIds);
    const registryEntries = await Promise.all(
      registryKeys.map((registryKey) =>
        this.cacheService.get<string[]>(registryKey),
      ),
    );

    const analysisKeys = Array.from(
      new Set(registryEntries.flatMap((entry) => entry ?? [])),
    );

    await this.cacheService.delMany([...analysisKeys, ...registryKeys]);
  }
}
