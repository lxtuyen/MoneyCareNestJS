import { CategoryType } from './entities/category.entity';

type SystemCategorySeed = {
  name: string;
  icon: string;
  type: CategoryType;
  is_system: true;
};

export const SYSTEM_CATEGORY_SEEDS: SystemCategorySeed[] = [
  // Income
  {
    name: 'Thu hồi nợ',
    icon: '💸',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Kinh doanh',
    icon: '🏪',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Lợi nhuận',
    icon: '📈',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Thưởng',
    icon: '🧧',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Trợ cấp',
    icon: '🫶',
    type: CategoryType.INCOME,
    is_system: true,
  },
  { name: 'Lương', icon: '💵', type: CategoryType.INCOME, is_system: true },
  // Expense
  {
    name: 'Chợ, siêu thị',
    icon: '🥬',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Ăn uống',
    icon: '🍽️',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Di chuyển',
    icon: '🚌',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Chi phí phát sinh',
    icon: '⚠️',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Mua sắm',
    icon: '🛒',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Giải trí',
    icon: '🎬',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Làm đẹp',
    icon: '💄',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Sức khỏe',
    icon: '💊',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Từ thiện',
    icon: '❤️',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Hóa đơn',
    icon: '🧾',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Nhà cửa',
    icon: '🏠',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Người thân',
    icon: '👪',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Đầu tư',
    icon: '📈',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Học tập',
    icon: '📚',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
];

export const SYSTEM_CATEGORY_RENAME_ALIASES: Array<{
  from: string;
  to: string;
  type: CategoryType;
}> = [
  { from: 'Đi chợ', to: 'Chợ, siêu thị', type: CategoryType.EXPENSE },
  { from: 'Giáo dục', to: 'Học tập', type: CategoryType.EXPENSE },
  { from: 'Khác', to: 'Chi phí phát sinh', type: CategoryType.EXPENSE },
  { from: 'Lãi suất', to: 'Lợi nhuận', type: CategoryType.INCOME },
  { from: 'Quà tặng', to: 'Trợ cấp', type: CategoryType.INCOME },
];
