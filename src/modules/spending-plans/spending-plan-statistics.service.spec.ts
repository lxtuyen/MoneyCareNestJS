import { SpendingPlanStatisticsService } from './spending-plan-statistics.service';
import { SpendingPlanCalculatorService } from './spending-plan-calculator.service';
import {
  SpendingPlanExpenseFrequency,
  SpendingPlanStatus,
} from './interfaces/spending-plan.enums';

describe('SpendingPlanStatisticsService', () => {
  const fixedNow = new Date('2026-06-06T05:00:00.000Z');
  let transactionRepo: {
    createQueryBuilder: jest.Mock;
  };
  let service: SpendingPlanStatisticsService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    transactionRepo = {
      createQueryBuilder: jest.fn(),
    };
    service = new SpendingPlanStatisticsService(
      {} as any,
      transactionRepo as any,
      new SpendingPlanCalculatorService(),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('does not project planned monthly expenses as daily run-rate spending', async () => {
    const expenses = [
      {
        amount: 1000000,
        type: 'expense',
        isTransfer: false,
        transaction_date: new Date('2026-06-02T05:00:00.000Z'),
        category: { id: 1, name: 'Thuê nhà trọ' },
        subCategory: null,
      },
      {
        amount: 200000,
        type: 'expense',
        isTransfer: false,
        transaction_date: new Date('2026-06-03T05:00:00.000Z'),
        category: { id: 2, name: 'Ăn uống' },
        subCategory: null,
      },
    ];
    transactionRepo.createQueryBuilder.mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(expenses),
    });

    const context = await service.buildExpenseContext(
      {
        id: 1,
        totalAmount: 5000000,
        estimatedExpenseTotal: 1000000,
        availableSpendingAmount: 4000000,
        status: SpendingPlanStatus.ACTIVE,
        estimatedExpenses: [
          {
            id: 10,
            amount: 1000000,
            monthlyLimit: 1000000,
            dailyLimit: null,
            frequencyType: SpendingPlanExpenseFrequency.MONTHLY,
            frequencyValue: 1,
            category: { id: 1, name: 'Thuê nhà trọ' },
            subCategory: null,
          },
        ],
      } as any,
      1,
      { month: 6, year: 2026 },
    );

    expect(context.spentAmount).toBe(1200000);
    expect(context.projectedEndBalance).toBe(3000000);
  });
});
