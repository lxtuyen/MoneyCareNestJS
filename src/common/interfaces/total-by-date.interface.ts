interface TotalByDate {
  date: string;
  type?: string;
  total: number | null;
}

interface TotalsByDate {
  income: TotalByDate[];
  expense: TotalByDate[];
}
export type { TotalByDate, TotalsByDate };
