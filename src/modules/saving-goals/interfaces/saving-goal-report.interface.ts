export interface SavingGoalReport {
  milestones: SavingGoalMilestone[];
  projection: SavingGoalProjection;
}

export interface SavingGoalMilestone {
  label: string;
  start_date: Date;
  end_date: Date;
  target: number;
  actual: number;
  is_completed: boolean;
}

export interface SavingGoalProjection {
  monthlySavingCapacity: number;
  requiredMonthlySaving: number;
  monthsRemaining: number | null;
  projectedDate: string | null;
  isOnTrack: boolean | null;
  monthsDiff: number | null;
  hasPlan: boolean;
}
