import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { FinancialCacheInvalidationService } from './financial-cache-invalidation.service';

@Global()
@Module({
  providers: [CacheService, FinancialCacheInvalidationService],
  exports: [CacheService, FinancialCacheInvalidationService],
})
export class AppCacheModule {}
