import { FinancialInsightPeriod } from 'src/common/cache/financial-cache.util';

export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface MonthPeriod {
  month: number;
  year: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export function formatDateInTimeZone(
  date: Date,
  timeZone = VIETNAM_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

export function getTodayStringInTimeZone(timeZone = VIETNAM_TIME_ZONE): string {
  return formatDateInTimeZone(new Date(), timeZone);
}

export function getDateInTimeZone(
  date = new Date(),
  timeZone = VIETNAM_TIME_ZONE,
): Date {
  const dateString = date.toLocaleString('en-US', { timeZone });
  return new Date(dateString);
}

export function getVietnamNow(date = new Date()): Date {
  return getDateInTimeZone(date, VIETNAM_TIME_ZONE);
}

export function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate();
}

export function getVietnamMonthRange(month: number, year: number): DateRange {
  const daysInMonth = getDaysInMonth(month, year);

  return {
    start: new Date(Date.UTC(year, month - 1, 1, -7, 0, 0, 0)),
    end: new Date(Date.UTC(year, month - 1, daysInMonth, 16, 59, 59, 999)),
  };
}

export function getReportDay(
  period: MonthPeriod,
  now = getVietnamNow(),
): number {
  const daysInMonth = getDaysInMonth(period.month, period.year);

  if (
    now.getFullYear() === period.year &&
    now.getMonth() + 1 === period.month
  ) {
    return Math.min(now.getDate(), daysInMonth);
  }

  if (
    now.getFullYear() > period.year ||
    (now.getFullYear() === period.year && now.getMonth() + 1 > period.month)
  ) {
    return daysInMonth;
  }

  return 1;
}

export function getDaysLeftInMonthPeriod(
  period: MonthPeriod,
  now = getVietnamNow(),
): number {
  const daysInMonth = getDaysInMonth(period.month, period.year);

  if (now.getFullYear() > period.year) return 0;
  if (now.getFullYear() === period.year && now.getMonth() + 1 > period.month) {
    return 0;
  }
  if (now.getFullYear() < period.year) return daysInMonth;
  if (now.getMonth() + 1 < period.month) return daysInMonth;

  return Math.max(0, daysInMonth - now.getDate() + 1);
}

export function formatDateParts(
  year: number,
  month: number,
  day: number,
): string {
  return [
    year.toString().padStart(4, '0'),
    month.toString().padStart(2, '0'),
    day.toString().padStart(2, '0'),
  ].join('-');
}

export function setStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function setEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function msToDays(ms: number): number {
  return ms / (1000 * 60 * 60 * 24);
}

export function getDaysDiff(d1: Date, d2: Date): number {
  return Math.ceil(msToDays(d1.getTime() - d2.getTime()));
}

export function getDateRange(period: FinancialInsightPeriod): DateRange {
  const now = new Date();

  if (period === 'this_month') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: now,
    };
  }

  const start = new Date(now);
  start.setDate(now.getDate() - 29);
  start.setHours(0, 0, 0, 0);

  return { start, end: now };
}

export function getPreviousRange(
  period: FinancialInsightPeriod,
  currentRange: DateRange,
): DateRange {
  if (period === 'this_month') {
    // Determine the calendar month and year in Vietnam timezone (GMT+7)
    const startVN = new Date(currentRange.start.getTime() + 7 * 60 * 60 * 1000);
    const currentMonth = startVN.getUTCMonth() + 1;
    const currentYear = startVN.getUTCFullYear();

    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

    return getVietnamMonthRange(prevMonth, prevYear);
  }

  const currentDurationMs =
    currentRange.end.getTime() - currentRange.start.getTime();
  const previousEnd = new Date(currentRange.start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - currentDurationMs);

  return { start: previousStart, end: previousEnd };
}

export function isValidDate(dateStr: string | null | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d.getTime());
}

export function getTodayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function normalizeIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;

  const trimmed = value.trim();
  const direct = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (direct) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    if (
      date.getUTCFullYear() === Number(direct[1]) &&
      date.getUTCMonth() + 1 === Number(direct[2]) &&
      date.getUTCDate() === Number(direct[3])
    ) {
      return trimmed;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  const vnDate = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(trimmed);
  if (!vnDate) return null;

  const day = vnDate[1].padStart(2, '0');
  const month = vnDate[2].padStart(2, '0');
  const year =
    vnDate[3].length === 2 ? `20${vnDate[3]}` : vnDate[3].padStart(4, '0');
  return normalizeIsoDate(`${year}-${month}-${day}`);
}

export function formatDurationFromMonths(monthsValue: number): string {
  const wholeMonths = Math.floor(monthsValue);
  const days = Math.round((monthsValue - wholeMonths) * 30);

  if (wholeMonths > 0 && days > 0) {
    return `${wholeMonths} tháng ${days} ngày`;
  }
  if (wholeMonths > 0) {
    return `${wholeMonths} tháng`;
  }
  return `${Math.max(1, days)} ngày`;
}
