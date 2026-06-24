import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { FinancialCacheInvalidationService } from './financial-cache-invalidation.service';
import { RecurringCacheService } from './recurring-cache.service';

@Global()
@Module({
  providers: [CacheService, FinancialCacheInvalidationService, RecurringCacheService],
  exports: [CacheService, FinancialCacheInvalidationService, RecurringCacheService],
})
export class AppCacheModule {}
