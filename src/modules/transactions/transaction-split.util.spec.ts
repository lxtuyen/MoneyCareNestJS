import { BadRequestException } from '@nestjs/common';
import { calculateTransactionSplits } from './transaction-split.util';

describe('calculateTransactionSplits', () => {
  const memberIds: [number, number] = [1, 2];

  it('splits equally without losing cents', () => {
    expect(
      calculateTransactionSplits({
        splitMethod: 'equal',
        totalAmount: 100.01,
        memberIds,
      }),
    ).toEqual([
      { userId: 1, amount: 50.01, percent: 50 },
      { userId: 2, amount: 50, percent: 50 },
    ]);
  });

  it('calculates percentage split and keeps total amount', () => {
    expect(
      calculateTransactionSplits({
        splitMethod: 'percentage',
        totalAmount: 100,
        memberIds,
        splits: [
          { userId: 1, percent: 60 },
          { userId: 2, percent: 40 },
        ],
      }),
    ).toEqual([
      { userId: 1, amount: 60, percent: 60 },
      { userId: 2, amount: 40, percent: 40 },
    ]);
  });

  it('rejects percentage split when total percent is not 100', () => {
    expect(() =>
      calculateTransactionSplits({
        splitMethod: 'percentage',
        totalAmount: 100,
        memberIds,
        splits: [
          { userId: 1, percent: 70 },
          { userId: 2, percent: 40 },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects fixed split when total amount does not match transaction', () => {
    expect(() =>
      calculateTransactionSplits({
        splitMethod: 'fixed',
        totalAmount: 100,
        memberIds,
        splits: [
          { userId: 1, amount: 40 },
          { userId: 2, amount: 50 },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
