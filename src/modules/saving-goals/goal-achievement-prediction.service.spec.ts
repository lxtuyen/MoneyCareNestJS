import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { PersonalizationService } from 'src/modules/personalization/personalization.service';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoal } from './entities/saving-goal.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { GoalAchievementPredictionService } from './goal-achievement-prediction.service';

describe('GoalAchievementPredictionService', () => {
  let service: GoalAchievementPredictionService;
  let goalRepo: any;
  let transactionRepo: any;
  let personalizationService: any;
  let spendingPlansService: any;
  let analyticsService: any;

  const fixedNow = new Date('2026-06-06T03:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalAchievementPredictionService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: PersonalizationService,
          useValue: {
            getOrBuildProfile: jest.fn(),
          },
        },
        {
          provide: SpendingPlansService,
          useValue: {
            getMonthlySavingCapacity: jest.fn(),
            getActiveStatistics: jest.fn(),
          },
        },
        {
          provide: AnalyticsService,
          useValue: {
            fetchAiBudgetingSnapshot: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<GoalAchievementPredictionService>(
      GoalAchievementPredictionService,
    );
    goalRepo = module.get(getRepositoryToken(SavingGoal));
    transactionRepo = module.get(getRepositoryToken(Transaction));
    personalizationService = module.get(PersonalizationService);
    spendingPlansService = module.get(SpendingPlansService);
    analyticsService = module.get(AnalyticsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns completed status when saved amount reaches target', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 10000000,
          endDate: '2026-09-30',
        }),
      ],
      profileSavings: 1000000,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('completed');
    expect(result.riskLevel).toBe('low');
    expect(result.remainingAmount).toBe(0);
    expect(result.predictedDaysToComplete).toBe(0);
    expect(result.reasonCodes).toContain('goal_already_completed');
  });

  it('calculates required rates and on-track status', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-10-04',
        }),
      ],
      profileSavings: 2000000,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.daysRemainingToDeadline).toBe(120);
    expect(result.requiredDailySavingRate).toBe(50000);
    expect(result.requiredWeeklySavingRate).toBe(350000);
    expect(result.requiredMonthlySavingRate).toBe(1520000);
    expect(result.status).toBe('on_track');
    expect(result.riskLevel).toBe('low');
  });

  it('marks slightly at risk when predicted completion is up to 14 days late', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-09-12',
        }),
      ],
      profileSavings: 1666667,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('slightly_at_risk');
    expect(result.riskLevel).toBe('medium');
    expect(result.daysDifference).toBeGreaterThan(0);
    expect(result.daysDifference).toBeLessThanOrEqual(14);
  });

  it('marks at risk when predicted completion is 15 to 45 days late', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-08-31',
        }),
      ],
      profileSavings: 1666667,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('at_risk');
    expect(result.riskLevel).toBe('medium');
    expect(result.daysDifference).toBeGreaterThanOrEqual(15);
    expect(result.daysDifference).toBeLessThanOrEqual(45);
  });

  it('marks off track when predicted completion is more than 45 days late', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-07-15',
        }),
      ],
      profileSavings: 1000000,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('off_track');
    expect(result.riskLevel).toBe('high');
    expect(result.daysDifference).toBeGreaterThan(45);
  });

  it('marks unlikely when saving velocity is zero', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-09-30',
        }),
      ],
      profileSavings: 0,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('unlikely');
    expect(result.riskLevel).toBe('high');
    expect(result.predictedCompletionDate).toBeNull();
    expect(result.confidence).toBeLessThan(0.55);
  });

  it('marks overdue when deadline has passed', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-05-31',
        }),
      ],
      profileSavings: 2000000,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('overdue');
    expect(result.riskLevel).toBe('high');
  });

  it('does not crash when transaction/profile data is missing', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-09-30',
        }),
      ],
      profileSavings: null,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.status).toBe('unlikely');
    expect(result.confidence).toBeLessThanOrEqual(0.45);
    expect(result.reasonCodes).toContain('insufficient_data');
  });

  it('creates recommended actions for monthly shortfall', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-08-31',
        }),
      ],
      profileSavings: 1200000,
      topExpenseCategories: [{ id: 1, name: 'Giải trí', amount: 2000000 }],
    });

    const result = await service.predictGoal(1, 1);

    expect(result.shortfallAmount).toBeGreaterThan(0);
    expect(result.recommendedActions[0].actionType).toBe(
      'increase_monthly_saving',
    );
    expect(
      result.recommendedActions.some((a) => a.actionType === 'reduce_expense'),
    ).toBe(true);
  });

  it('allocates fallback saving capacity across multiple active goals', async () => {
    setupContext({
      goals: [
        buildGoal({
          id: 1,
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-10-04',
        }),
        buildGoal({
          id: 2,
          target: 8000000,
          walletBalance: 2000000,
          endDate: '2026-10-04',
        }),
      ],
      profileSavings: 3000000,
    });

    const result = await service.predictGoal(1, 1);

    expect(result.currentMonthlySavingRate).toBe(1500000);
  });

  it('does not show early completion when forecasted monthly savings is negative', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 471200,
          walletBalance: 380000,
          endDate: '2026-07-20',
        }),
      ],
      profileSavings: 500000,
      planStats: {
        totalAmount: 3000000,
        spentAmount: 1880000,
        projectedEndBalance: 1120000,
        fixedExpenses: [{ category: { name: 'Ăn uống' } }],
      },
      budgetExceedPredictions: [
        { categoryName: 'Ăn uống', totalForecast: 3610283 },
      ],
      monthlySavingCapacity: {
        totalAmount: 3000000,
        monthlySavingCapacity: 264760,
        estimatedExpenses: [{ category: { name: 'Ăn uống' } }],
      },
    });

    const result = await service.predictGoal(1, 1);

    expect(result.currentMonthlySavingRate).toBe(-610283);
    expect(result.predictedCompletionDate).toBeNull();
    expect(result.daysDifference).toBeNull();
    expect(result.status).toBe('unlikely');
    expect(result.reasonCodes).toContain('negative_cash_flow');
    expect(result.supportingData.planBasedMonthlySavingRate).toBe(264760);
    expect(
      result.supportingData.planBasedPredictedCompletionDate,
    ).not.toBeNull();
    expect(result.supportingData.planBasedDaysDifference).toBeLessThan(0);
  });

  it('prefers forecasted monthly savings over sparse goal wallet deposits', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-10-04',
        }),
      ],
      profileSavings: 2000000,
      planStats: {
        totalAmount: 12000000,
        spentAmount: 7000000,
        projectedEndBalance: 5000000,
        fixedExpenses: [{ category: { name: 'Ăn uống' } }],
      },
      budgetExceedPredictions: [
        { categoryName: 'Ăn uống', totalForecast: 8500000 },
      ],
      transactions: [
        buildTransaction('income', 5000000, '2026-05-10', { walletId: 11 }),
      ],
    });

    const result = await service.predictGoal(1, 1);

    expect(result.supportingData.savingVelocitySource).toBe(
      'forecasted_monthly_savings',
    );
    expect(result.currentMonthlySavingRate).toBe(3500000);
  });

  it('uses monthly transaction averages for fallback saving velocity when profile is missing', async () => {
    setupContext({
      goals: [
        buildGoal({
          target: 10000000,
          walletBalance: 4000000,
          endDate: '2026-10-04',
        }),
      ],
      profileSavings: null,
      transactions: [
        buildTransaction('income', 10000000, '2026-01-05'),
        buildTransaction('expense', 4000000, '2026-01-20'),
        buildTransaction('income', 6000000, '2026-03-10'),
        buildTransaction('expense', 1000000, '2026-03-11'),
        buildTransaction('expense', 2000000, '2026-06-01'),
        buildTransaction('income', 9000000, '2026-06-02', {
          isTransfer: true,
        }),
      ],
    });

    const result = await service.predictGoal(1, 1);

    expect(result.currentMonthlySavingRate).toBe(5500000);
    expect(result.supportingData.averageMonthlyIncome).toBe(8000000);
    expect(result.supportingData.averageMonthlyExpense).toBe(2500000);
    expect(result.supportingData.averageMonthlySavings).toBe(5500000);
    expect(result.supportingData.activeMonths).toBe(2);
  });

  function setupContext(input: {
    goals: any[];
    profileSavings: number | null;
    topExpenseCategories?: Array<{ id: number; name: string; amount: number }>;
    transactions?: any[];
    planStats?: any;
    budgetExceedPredictions?: Array<{
      categoryName: string;
      totalForecast: number;
    }>;
    monthlySavingCapacity?: any;
  }) {
    goalRepo.findOne.mockImplementation(({ where }: any) => {
      const id = where.id;
      return Promise.resolve(
        input.goals.find((goal) => goal.id === id) ?? null,
      );
    });
    goalRepo.find.mockResolvedValue(input.goals);

    transactionRepo.createQueryBuilder.mockReturnValue({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(input.transactions ?? []),
    });

    if (input.profileSavings === null) {
      personalizationService.getOrBuildProfile.mockRejectedValue(
        new Error('profile missing'),
      );
    } else {
      personalizationService.getOrBuildProfile.mockResolvedValue({
        averageMonthlyIncome: 12000000,
        averageMonthlyExpense: 12000000 - input.profileSavings,
        averageMonthlySavings: input.profileSavings,
        confidenceScore: 70,
        budgetDisciplineScore: 80,
        topExpenseCategories: input.topExpenseCategories ?? [],
      });
    }

    spendingPlansService.getMonthlySavingCapacity.mockResolvedValue(
      input.monthlySavingCapacity ?? null,
    );
    spendingPlansService.getActiveStatistics.mockResolvedValue({
      success: !!input.planStats,
      data: input.planStats ?? null,
    });
    analyticsService.fetchAiBudgetingSnapshot.mockResolvedValue(
      input.budgetExceedPredictions
        ? {
            budgetExceedPredictions: input.budgetExceedPredictions,
            expectedSavingsAmount: 0,
          }
        : null,
    );
  }

  function buildGoal(input: {
    id?: number;
    target: number;
    walletBalance: number;
    endDate: string | null;
  }) {
    return {
      id: input.id ?? 1,
      name: 'Mua điện thoại',
      target: input.target,
      saved_amount: input.walletBalance,
      is_completed: false,
      start_date: new Date('2026-01-01T00:00:00.000Z'),
      end_date: input.endDate
        ? new Date(`${input.endDate}T00:00:00.000Z`)
        : null,
      wallet: { id: 10 + (input.id ?? 1), balance: input.walletBalance },
      user: { id: 1 },
    };
  }

  function buildTransaction(
    type: 'income' | 'expense',
    amount: number,
    date: string,
    options: { isTransfer?: boolean; walletId?: number } = {},
  ) {
    return {
      id: Number(`${date.replace(/\D/g, '')}${type === 'income' ? 1 : 2}`),
      amount,
      type,
      transaction_date: new Date(`${date}T08:00:00.000Z`),
      isTransfer: options.isTransfer ?? false,
      wallet: options.walletId ? { id: options.walletId } : undefined,
    };
  }
});
