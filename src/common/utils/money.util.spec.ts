import { coerceMoneyAmount, roundMoney, normalizeAmount } from './money.util';

describe('money.util', () => {
  describe('roundMoney', () => {
    it('rounds a number to 2 decimal places', () => {
      expect(roundMoney(123.456)).toBe(123.46);
      expect(roundMoney(123.454)).toBe(123.45);
    });
  });

  describe('normalizeAmount', () => {
    it('returns null for negative or zero amounts', () => {
      expect(normalizeAmount(-10)).toBeNull();
      expect(normalizeAmount(0)).toBeNull();
      expect(normalizeAmount(null)).toBeNull();
    });

    it('multiplies values smaller than 1000 by 1000', () => {
      expect(normalizeAmount(500)).toBe(500000);
      expect(normalizeAmount(3.5)).toBe(3500);
    });

    it('rounds amounts larger than or equal to 1000', () => {
      expect(normalizeAmount(1250.6)).toBe(1251);
      expect(normalizeAmount(1000)).toBe(1000);
    });
  });

  describe('coerceMoneyAmount', () => {
    it('parses raw money-like values without shorthand scaling', () => {
      expect(coerceMoneyAmount('12,500Ä‘')).toBe(12500);
      expect(coerceMoneyAmount(1250.6)).toBe(1251);
      expect(coerceMoneyAmount('abc')).toBe(0);
      expect(coerceMoneyAmount(-100)).toBe(0);
    });
  });
});
