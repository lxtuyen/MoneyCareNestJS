import {
  SpendingPlanStatus,
  SpendingPlanTrackingType,
} from './spending-plan.enums';

export interface SpendingPlanFilters {
  status?: SpendingPlanStatus;
}

export interface TrackingTypeInput {
  trackingType?: SpendingPlanTrackingType | null;
}

export interface DailySeriesItem {
  date: string;
  spent: number;
}
