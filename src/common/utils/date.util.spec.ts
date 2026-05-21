import {
  formatDateInTimeZone,
  formatDateParts,
  getDaysLeftInMonthPeriod,
  getReportDay,
  getVietnamMonthRange,
  getVietnamNow,
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
});
