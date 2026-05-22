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
