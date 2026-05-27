import {
  buildSavingGoalDurationMessage,
  buildSavingGoalRecommendation,
} from './saving-goal-proposal.helper';

describe('saving goal proposal helper', () => {
  it('marks requested duration as warning when required saving exceeds fixed capacity', () => {
    const result = buildSavingGoalDurationMessage({
      name: 'Laptop',
      target: 12000000,
      amountToSave: 12000000,
      months: 2,
      capacity: {
        totalAmount: 10000000,
        fixedExpenseTotal: 6000000,
      },
      plannedSavingCapacity: 3000000,
      mode: 'change_duration',
    });

    expect(result).toEqual(
      expect.objectContaining({
        isWarning: true,
        requiredPerMonth: 6000000,
        maxMonthlySaving: 3000000,
      }),
    );
  });

  it('marks requested duration as warning when required saving exceeds planned capacity', () => {
    const result = buildSavingGoalDurationMessage({
      name: 'Phone',
      target: 9000000,
      amountToSave: 9000000,
      months: 3,
      capacity: {
        totalAmount: 10000000,
        fixedExpenseTotal: 2000000,
      },
      plannedSavingCapacity: 2500000,
      mode: 'new_goal',
    });

    expect(result).toEqual(
      expect.objectContaining({
        isWarning: true,
        requiredPerMonth: 3000000,
        maxMonthlySaving: 2500000,
      }),
    );
  });

  it('keeps no-plan requested duration non-warning', () => {
    const result = buildSavingGoalDurationMessage({
      name: 'Trip',
      target: 5000000,
      amountToSave: 5000000,
      months: 4,
      capacity: null,
      plannedSavingCapacity: 0,
      mode: 'new_goal',
    });

    expect(result).toEqual(
      expect.objectContaining({
        isWarning: false,
        requiredPerMonth: 1250000,
        maxMonthlySaving: 0,
      }),
    );
  });

  it('estimates the recommendation by days from current saving capacity', () => {
    const result = buildSavingGoalRecommendation(500000, 250000, 30);

    expect(result).toEqual(
      expect.objectContaining({
        daysEstimate: 60,
        months: 2,
        suggestedDailySaving: 9000,
        suggestedMonthlySaving: 250000,
        maxMonthlySaving: 250000,
      }),
    );
  });
});
