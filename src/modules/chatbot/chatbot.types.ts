export type ChatExpenseResult = {
  time: string | null;
  amount: number | null;
  currency: string | null;
  category_name: string | null;
  description: string | null;
  confidence: number;
};

export type CatOption = { id: number; name: string };
