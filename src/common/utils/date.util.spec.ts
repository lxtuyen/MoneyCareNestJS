import {
  formatDateInTimeZone,
  formatDateParts,
  getDaysLeftInMonthPeriod,
  getReportDay,
  getVietnamMonthRange,
  getVietnamNow,
  getDateRange,
  getPreviousRange,
  getTodayIsoDate,
  normalizeIsoDate,
} from './date.util';

describe('date.util', () => {
  describe('formatDateInTimeZone', () => {
    it('formats a date using the requested time zone', () => {
      const date = new Date('2026-05-20T18:00:00.000Z');

      expect(formatDateInTimeZone(date, 'Asia/Ho_Chi_Minh')).toBe('2026-05-21');
    });
  });

  describe('getVietnamNow', () => {
    it('returns the Vietnam wall-clock date for a UTC instant', () => {
      const date = new Date('2026-05-20T18:00:00.000Z');
      const vietnamNow = getVietnamNow(date);

      expect(vietnamNow.getFullYear()).toBe(2026);
      expect(vietnamNow.getMonth()).toBe(4);
      expect(vietnamNow.getDate()).toBe(21);
    });
  });

  describe('getVietnamMonthRange', () => {
    it('returns UTC bounds for a Vietnam calendar month', () => {
      const range = getVietnamMonthRange(5, 2026);

      expect(range.start.toISOString()).toBe('2026-04-30T17:00:00.000Z');
      expect(range.end.toISOString()).toBe('2026-05-31T16:59:59.999Z');
    });
  });

  describe('getReportDay', () => {
    it('returns current day for current period', () => {
      const now = new Date('2026-05-21T12:00:00.000Z');

      expect(getReportDay({ month: 5, year: 2026 }, now)).toBe(21);
    });

    it('returns last day for past period', () => {
      const now = new Date('2026-05-21T12:00:00.000Z');

      expect(getReportDay({ month: 4, year: 2026 }, now)).toBe(30);
    });

    it('returns first day for future period', () => {
      const now = new Date('2026-05-21T12:00:00.000Z');

      expect(getReportDay({ month: 6, year: 2026 }, now)).toBe(1);
    });
  });

  describe('getDaysLeftInMonthPeriod', () => {
    it('returns remaining days including today for current period', () => {
      const now = new Date('2026-05-21T12:00:00.000Z');

      expect(getDaysLeftInMonthPeriod({ month: 5, year: 2026 }, now)).toBe(11);
    });
  });

  describe('formatDateParts', () => {
    it('formats numeric date parts as YYYY-MM-DD', () => {
      expect(formatDateParts(2026, 5, 1)).toBe('2026-05-01');
    });
  });

  describe('getDateRange', () => {
    it('returns start of month to now for "this_month"', () => {
      const range = getDateRange('this_month');
      const now = new Date();
      expect(range.start.getFullYear()).toBe(now.getFullYear());
      expect(range.start.getMonth()).toBe(now.getMonth());
      expect(range.start.getDate()).toBe(1);
      expect(range.end.getTime()).toBeLessThanOrEqual(now.getTime());
    });

    it('returns 30 days range for "last_30_days"', () => {
      const range = getDateRange('last_30_days');
      const diffMs = range.end.getTime() - range.start.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeGreaterThanOrEqual(29);
      expect(diffDays).toBeLessThanOrEqual(30);
    });
  });

  describe('getPreviousRange', () => {
    it('returns previous month range for "this_month"', () => {
      const currentRange = {
        start: new Date(2026, 4, 1), // May 1st 2026
        end: new Date(2026, 4, 23), // May 23rd 2026
      };
      const prev = getPreviousRange('this_month', currentRange);
      expect(prev.start.getFullYear()).toBe(2026);
      expect(prev.start.getMonth()).toBe(3); // April
      expect(prev.start.getDate()).toBe(1);
      expect(prev.end.getFullYear()).toBe(2026);
      expect(prev.end.getMonth()).toBe(3);
      expect(prev.end.getDate()).toBe(30);
    });

    it('returns same duration shifted back for other periods', () => {
      const currentRange = {
        start: new Date(2026, 4, 1, 0, 0, 0, 0),
        end: new Date(2026, 4, 30, 0, 0, 0, 0),
      };
      const prev = getPreviousRange('last_30_days', currentRange);
      expect(prev.end.getTime()).toBe(currentRange.start.getTime() - 1);
      const prevDuration = prev.end.getTime() - prev.start.getTime();
      const currDuration =
        currentRange.end.getTime() - currentRange.start.getTime();
      expect(prevDuration).toBe(currDuration);
    });
  });

  describe('normalizeIsoDate', () => {
    it('normalizes ISO and Vietnamese date strings', () => {
      expect(normalizeIsoDate('2026-05-23')).toBe('2026-05-23');
      expect(normalizeIsoDate('23/05/2026')).toBe('2026-05-23');
      expect(normalizeIsoDate('31/02/2026')).toBeNull();
    });
  });

  describe('getTodayIsoDate', () => {
    it('returns a YYYY-MM-DD string', () => {
      expect(getTodayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
