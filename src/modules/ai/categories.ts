export type CategoryKey =
  | 'EATING_OUT'
  | 'TRANSPORT'
  | 'SHOPPING'
  | 'BILLS'
  | 'EDUCATION'
  | 'ENTERTAIN'
  | 'OTHER';

export interface CategoryDef {
  id: number;
  key: CategoryKey;
  name: string;
}

export const CATEGORIES: CategoryDef[] = [
  { id: 1, key: 'EATING_OUT', name: 'Ăn uống' },
  { id: 2, key: 'TRANSPORT', name: 'Di chuyển' },
  { id: 3, key: 'SHOPPING', name: 'Mua sắm' },
  { id: 4, key: 'BILLS', name: 'Hóa đơn' },
  { id: 5, key: 'EDUCATION', name: 'Giáo dục' },
  { id: 6, key: 'ENTERTAIN', name: 'Giải trí' },
  { id: 7, key: 'OTHER', name: 'Khác' },
];
