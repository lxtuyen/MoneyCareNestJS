import { Repository } from 'typeorm';
import { getVietnamMonthRange, getVietnamNow } from 'src/common/utils/date.util';
import { Transaction } from './entities/transaction.entity';

export interface TransactionBaseQueryOptions {
  categoryId?: number;
  subCategoryId?: number;
  walletId?: number;
  startDate?: string;
  endDate?: string;
  withRelations?: boolean;
  categoryName?: string;
  excludeTransfer?: boolean;
}

export function buildTransactionBaseQuery(
  transactionRepo: Repository<Transaction>,
  userId: number,
  type: 'income' | 'expense',
  {
    categoryId,
    subCategoryId,
    walletId,
    startDate,
    endDate,
    withRelations = false,
    categoryName,
    excludeTransfer = true,
  }: TransactionBaseQueryOptions = {},
) {
  const query = transactionRepo.createQueryBuilder('transaction');

  if (withRelations) {
    query.leftJoinAndSelect('transaction.category', 'category');
    query.leftJoinAndSelect('transaction.subCategory', 'subCategory');
    query.leftJoinAndSelect('transaction.user', 'user');
    query.leftJoinAndSelect('transaction.wallet', 'wallet');
  } else {
    query.leftJoin('transaction.category', 'category');
    query.leftJoin('transaction.subCategory', 'subCategory');
    query.leftJoin('transaction.user', 'user');
    query.leftJoin('transaction.wallet', 'wallet');
  }

  query
    .where('user.id = :userId', { userId })
    .andWhere('transaction.type = :type', { type });

  if (excludeTransfer) {
    query.andWhere('transaction.isTransfer = :isTransfer', {
      isTransfer: false,
    });
  }

  if (categoryId) {
    query.andWhere('category.id = :categoryId', { categoryId });
  }
  if (subCategoryId) {
    query.andWhere('subCategory.id = :subCategoryId', { subCategoryId });
  }
  if (walletId) {
    query.andWhere('transaction.wallet = :walletId', { walletId });
  }

  const vietnamNow = getVietnamNow();
  const currentMonthRange = getVietnamMonthRange(
    vietnamNow.getMonth() + 1,
    vietnamNow.getFullYear(),
  );

  const start =
    startDate && startDate !== 'null' && startDate !== 'undefined'
      ? new Date(startDate)
      : currentMonthRange.start;

  const end =
    endDate && endDate !== 'null' && endDate !== 'undefined'
      ? new Date(endDate)
      : currentMonthRange.end;

  if (!isNaN(start.getTime())) {
    query.andWhere('transaction.transaction_date >= :start', { start });
  }
  if (!isNaN(end.getTime())) {
    query.andWhere('transaction.transaction_date <= :end', { end });
  }
  if (categoryName) {
    query.andWhere('category.name LIKE :catName', {
      catName: `%${categoryName}%`,
    });
  }

  return query;
}
