import { CategoryType } from './entities/category.entity';

type SystemCategorySeed = {
  name: string;
  icon: string;
  type: CategoryType;
  is_system: true;
};

type SystemSubCategorySeed = {
  name: string;
  icon: string;
};

export const SYSTEM_CATEGORY_SEEDS: SystemCategorySeed[] = [
  // Expense
  {
    name: 'Ăn uống',
    icon: '🍔',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Đi chợ',
    icon: '🛒',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Di chuyển',
    icon: '🚗',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Hóa đơn',
    icon: '⚡',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Mua sắm',
    icon: '🛍️',
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
    name: 'Giải trí',
    icon: '🎬',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Giáo dục',
    icon: '📚',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  {
    name: 'Làm đẹp',
    icon: '✨',
    type: CategoryType.EXPENSE,
    is_system: true,
  },
  { name: 'Khác', icon: '📦', type: CategoryType.EXPENSE, is_system: true },
  // Income
  { name: 'Lương', icon: '💵', type: CategoryType.INCOME, is_system: true },
  {
    name: 'Thưởng',
    icon: '🧧',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Kinh doanh',
    icon: '📈',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Lãi suất',
    icon: '🏦',
    type: CategoryType.INCOME,
    is_system: true,
  },
  {
    name: 'Quà tặng',
    icon: '🎁',
    type: CategoryType.INCOME,
    is_system: true,
  },
  { name: 'Khác', icon: '➕', type: CategoryType.INCOME, is_system: true },
];

export const SYSTEM_SUB_CATEGORY_SEED_GROUPS: Record<
  string,
  SystemSubCategorySeed[]
> = {
  'Hóa đơn': [
    { name: 'Điện', icon: '⚡' },
    { name: 'Nước', icon: '💧' },
    { name: 'Internet', icon: '🌐' },
    { name: 'Thuê nhà', icon: '🏠' },
    { name: 'Điện thoại', icon: '📱' },
  ],
  'Giáo dục': [
    { name: 'Học phí', icon: '🎓' },
    { name: 'Sách vở', icon: '📚' },
    { name: 'Khóa học', icon: '🧑‍🏫' },
  ],
  'Ăn uống': [
    { name: 'Bữa sáng', icon: '🥪' },
    { name: 'Bữa trưa', icon: '🍱' },
    { name: 'Bữa tối', icon: '🍲' },
    { name: 'Cà phê/Trà sữa', icon: '☕' },
    { name: 'Ăn ngoài', icon: '🍽️' },
  ],
  'Di chuyển': [
    { name: 'Xăng xe', icon: '⛽' },
    { name: 'Grab/Taxi', icon: '🚕' },
    { name: 'Gửi xe', icon: '🅿️' },
    { name: 'Bảo dưỡng', icon: '🛠️' },
  ],
};
