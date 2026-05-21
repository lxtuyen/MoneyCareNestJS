import { roundMoney } from './money.util';

describe('money.util', () => {
  describe('roundMoney', () => {
    it('rounds a number to 2 decimal places', () => {
      expect(roundMoney(123.456)).toBe(123.46);
      expect(roundMoney(123.454)).toBe(123.45);
    });
  });
});
