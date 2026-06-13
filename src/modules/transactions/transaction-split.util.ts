import { BadRequestException } from '@nestjs/common';

export type SplitMethod = 'none' | 'equal' | 'percentage' | 'fixed';

export type SplitInput = {
  userId: number;
  amount?: number;
  percent?: number;
};

export type CalculatedSplit = {
  userId: number;
  amount: number;
  percent: number | null;
};

const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (value: number): number => value / 100;
const roundMoney = (value: number): number => fromCents(toCents(value));

export function calculateTransactionSplits({
  splitMethod,
  totalAmount,
  memberIds,
  splits,
}: {
  splitMethod: SplitMethod;
  totalAmount: number;
  memberIds: [number, number];
  splits?: SplitInput[];
}): CalculatedSplit[] {
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new BadRequestException('Số tiền giao dịch phải lớn hơn 0.');
  }

  const [userIdA, userIdB] = memberIds;

  if (splitMethod === 'equal') {
    const totalCents = toCents(totalAmount);
    const half = Math.floor(totalCents / 2);
    return [
      {
        userId: userIdA,
        amount: fromCents(totalCents - half),
        percent: 50,
      },
      { userId: userIdB, amount: fromCents(half), percent: 50 },
    ];
  }

  if (!splits || splits.length === 0) {
    throw new BadRequestException('Thông tin chia tiền không hợp lệ.');
  }

  const splitA = splits.find((split) => split.userId === userIdA);
  const splitB = splits.find((split) => split.userId === userIdB);
  if (!splitA || !splitB) {
    throw new BadRequestException(
      'Thiếu thông tin chia cho thành viên cặp đôi.',
    );
  }

  if (splitMethod === 'percentage') {
    const pctA = Number(splitA.percent ?? 0);
    const pctB = Number(splitB.percent ?? 0);
    if (pctA < 0 || pctB < 0 || roundMoney(pctA + pctB) !== 100) {
      throw new BadRequestException('Tổng phần trăm chia phải bằng 100%.');
    }

    const amountA = roundMoney((totalAmount * pctA) / 100);
    return [
      { userId: userIdA, amount: amountA, percent: pctA },
      {
        userId: userIdB,
        amount: roundMoney(totalAmount - amountA),
        percent: pctB,
      },
    ];
  }

  if (splitMethod === 'fixed') {
    const amountA = Number(splitA.amount ?? 0);
    const amountB = Number(splitB.amount ?? 0);
    if (
      amountA < 0 ||
      amountB < 0 ||
      toCents(amountA) + toCents(amountB) !== toCents(totalAmount)
    ) {
      throw new BadRequestException(
        'Tổng số tiền chia phải bằng tổng số tiền giao dịch.',
      );
    }

    return [
      { userId: userIdA, amount: roundMoney(amountA), percent: null },
      { userId: userIdB, amount: roundMoney(amountB), percent: null },
    ];
  }

  return [];
}
