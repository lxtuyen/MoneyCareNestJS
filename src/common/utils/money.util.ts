export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeAmount(amount: number | null): number | null {
  if (!amount || amount <= 0) return null;
  if (amount < 1000) return amount * 1000;
  return Math.round(amount);
}

export function coerceMoneyAmount(value: unknown): number {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.replace(/[^\d.-]/g, ''))
        : 0;
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric);
}

export function formatVnd(amount: number): string {
  return Math.round(amount).toLocaleString('vi-VN') + 'đ';
}
