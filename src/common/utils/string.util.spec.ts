import { coerceString, norm } from './string.util';

describe('string.util', () => {
  describe('norm', () => {
    it('normalizes Vietnamese text and removes diacritics', () => {
      expect(norm('Ăn uống')).toBe('an uong');
      expect(norm('Đi lại')).toBe('đi lai');
      expect(norm('  Mua sắm điện thoại   ')).toBe('mua sam đien thoai');
    });

    it('returns an empty string when value is falsy', () => {
      expect(norm(null as unknown as string)).toBe('');
      expect(norm(undefined as unknown as string)).toBe('');
      expect(norm('')).toBe('');
    });
  });

  describe('coerceString', () => {
    it('trims string values and returns empty string for non-strings', () => {
      expect(coerceString('  abc  ')).toBe('abc');
      expect(coerceString(123)).toBe('');
      expect(coerceString(null)).toBe('');
    });
  });
});
