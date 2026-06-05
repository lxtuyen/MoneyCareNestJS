export interface AiFeedbackCountSummary {
  totalCount: number;
  acceptedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  dismissedCount: number;
  acceptanceRate: number;
  modificationRate: number;
  rejectionRate: number;
}

export interface BudgetCategoryFeedbackSummary {
  categoryName: string;
  count: number;
  modifiedCount: number;
  rejectedCount: number;
  acceptedCount: number;
  averageDeltaPct: number;
  rejectionRate: number;
  acceptedRate: number;
  preferredLimitAvg: number;
}

export interface BudgetFeedbackSummary extends AiFeedbackCountSummary {
  averageModificationDeltaPct: number;
  categoryPreferences: BudgetCategoryFeedbackSummary[];
}

export interface CategoryCorrectionSummary {
  keyword?: string;
  merchant?: string;
  finalCategoryName: string;
  count: number;
}

export interface CategoryFeedbackSummary {
  totalCount: number;
  acceptedCount: number;
  correctedCount: number;
  rejectedCount: number;
  correctionRate: number;
  personalCorrections: CategoryCorrectionSummary[];
  correctionByMerchant: CategoryCorrectionSummary[];
}

export interface SavingGoalFeedbackSummary extends AiFeedbackCountSummary {
  averageDurationDelta: number;
  averageMonthlySavingDelta: number;
}

export type AiFeedbackSummaryResponse = any;
