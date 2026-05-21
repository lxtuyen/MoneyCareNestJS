import { SpendingPlanStatus } from './spending-plan.enums';

export interface SpendingPlanFilters {
  status?: SpendingPlanStatus;
}

export interface DailySeriesItem {
  date: string;
  spent: number;
}
