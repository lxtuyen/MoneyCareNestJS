import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import {
  SpendingPlanExpenseFrequency,
  SpendingPlanTrackingType,
} from './interfaces/spending-plan.enums';

describe('SpendingPlanCalculatorService', () => {
  let service: SpendingPlanCalculatorService;

  beforeEach(() => {
    service = new SpendingPlanCalculatorService();
  });

  it('monthlyizes recurring plan items in fixedExpenseTotal', () => {
    const result = service.calculate({
      totalAmount: 3000000,
      month: 5,
      year: 2026,
      fixedExpenses: [
        {
          amount: 100000,
          frequencyType: SpendingPlanExpenseFrequency.MONTHLY,
          frequencyValue: 1,
          trackingType: SpendingPlanTrackingType.FIXED_BILL,
        },
        {
          amount: 20000,
          frequencyType: SpendingPlanExpenseFrequency.DAILY,
          frequencyValue: 3,
          trackingType: SpendingPlanTrackingType.BUDGET,
        },
      ],
    });

    expect(result.fixedExpenseTotal).toBe(1960000);
    expect(result.availableSpendingAmount).toBe(1040000);
  });
});
