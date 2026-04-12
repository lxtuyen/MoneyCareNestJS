export const CACHE_KEY_VERSION = 'v1';

export const FINANCIAL_INSIGHT_PERIODS = [
  'this_month',
  'last_30_days',
] as const;

export type FinancialInsightPeriod = (typeof FINANCIAL_INSIGHT_PERIODS)[number];

export function buildInsightsCacheKey(
  userId: number,
  fundId: number,
  period: FinancialInsightPeriod,
): string {
  return `${CACHE_KEY_VERSION}:insights:user:${userId}:fund:${fundId}:period:${period}`;
}

export function buildStatisticsSummaryCacheKey(
  userId: number,
  fundId: number,
): string {
  return `${CACHE_KEY_VERSION}:stats:user:${userId}:fund:${fundId}:summary:this_month`;
}

export function buildAiAnalysisCacheKey(
  userId: number,
  fundId: number,
  intentHash: string,
): string {
  return `${CACHE_KEY_VERSION}:ai_analysis:user:${userId}:fund:${fundId}:intent:${intentHash}`;
}

export function getAiAnalysisCacheKeys(
  userId: number,
  fundIds: number[],
): string[] {
  // We store a registry key that lists all AI analysis cache keys for this user+fund
  // so we can bulk-delete them on invalidation without wildcard support.
  return Array.from(new Set(fundIds.map((fundId) => Number(fundId) || 0))).map(
    (fundId) =>
      `${CACHE_KEY_VERSION}:ai_analysis:user:${userId}:fund:${fundId}:__registry__`,
  );
}

export function getFinancialCacheKeys(
  userId: number,
  fundIds: number[],
  periods: readonly FinancialInsightPeriod[] = FINANCIAL_INSIGHT_PERIODS,
): string[] {
  const uniqueFundIds = Array.from(
    new Set(fundIds.map((fundId) => Number(fundId) || 0)),
  );

  const keys = uniqueFundIds.flatMap((fundId) => [
    buildStatisticsSummaryCacheKey(userId, fundId),
    ...periods.map((period) => buildInsightsCacheKey(userId, fundId, period)),
  ]);

  return Array.from(new Set(keys));
}
