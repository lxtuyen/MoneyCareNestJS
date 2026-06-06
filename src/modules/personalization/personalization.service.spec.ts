import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PersonalizationService } from './personalization.service';
import { PersonalFinanceProfile } from './entities/personal-finance-profile.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { SpendingPlan } from 'src/modules/spending-plans/entities/spending-plan.entity';
import { UserCategoryPreference } from 'src/modules/categories/entities/user-category-preference.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { AiFeedbackService } from 'src/modules/ai-feedback/ai-feedback.service';

describe('PersonalizationService', () => {
  let module: TestingModule;
  let service: PersonalizationService;
  let profileRepo: any;
  let transactionRepo: any;
  let goalRepo: any;
  let planRepo: any;
  let preferenceRepo: any;
  let userRepo: any;
  let aiFeedbackService: any;
  const fixedNow = new Date('2026-06-15T03:00:00.000Z');

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(fixedNow);

    profileRepo = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((dto) => dto),
      save: jest.fn().mockImplementation((profile) => Promise.resolve(profile)),
    };
    transactionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };
    goalRepo = {
      count: jest.fn().mockResolvedValue(0),
    };
    planRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    preferenceRepo = {
      find: jest.fn().mockResolvedValue([]),
    };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 1 }),
    };
    aiFeedbackService = {
      getSummary: jest.fn().mockResolvedValue({
        budget: {
          totalCount: 0,
          averageModificationDeltaPct: 0,
          categoryPreferences: [],
        },
      }),
    };

    module = await Test.createTestingModule({
      providers: [
        PersonalizationService,
        {
          provide: getRepositoryToken(PersonalFinanceProfile),
          useValue: profileRepo,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepo,
        },
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: goalRepo,
        },
        {
          provide: getRepositoryToken(SpendingPlan),
          useValue: planRepo,
        },
        {
          provide: getRepositoryToken(UserCategoryPreference),
          useValue: preferenceRepo,
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: AiFeedbackService,
          useValue: aiFeedbackService,
        },
      ],
    }).compile();

    service = module.get<PersonalizationService>(PersonalizationService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should compile successfully', () => {
    expect(service).toBeDefined();
  });

  it('should build a profile with insufficient_data when transaction count is low', async () => {
    const profile = await service.rebuildProfile(1);
    expect(profile).toBeDefined();
    expect(profile.spendingStyle).toBe('insufficient_data');
    expect(profile.averageMonthlyIncome).toBe(0);
    expect(profile.averageMonthlyExpense).toBe(0);
    expect(profile.averageMonthlySavings).toBe(0);
    expect(profile.confidenceScore).toBeLessThanOrEqual(30);
  });

  it('should compute volatility and health scores correctly with mock transactions', async () => {
    const mockTxs = [
      {
        id: 1,
        amount: 20000000,
        type: 'income',
        transaction_date: new Date(),
        isTransfer: false,
      },
      {
        id: 2,
        amount: 1000000,
        type: 'expense',
        transaction_date: new Date(),
        isTransfer: false,
        category: { id: 1, name: 'Food' },
      },
      {
        id: 3,
        amount: 500000,
        type: 'expense',
        transaction_date: new Date(),
        isTransfer: false,
        category: { id: 1, name: 'Food' },
      },
    ];
    transactionRepo.createQueryBuilder().getMany.mockResolvedValueOnce(mockTxs);

    const profile = await service.rebuildProfile(1);
    expect(profile.averageMonthlyIncome).toBe(0);
    expect(profile.averageMonthlyExpense).toBe(0);
    expect(profile.averageMonthlySavings).toBe(0);
    expect(profile.savingsRate).toBe(0);
    expect(profile.riskLevel).toBe('medium');
  });

  it('should average monthly income and expense from months with data only', async () => {
    const mockTxs = [
      buildTx('income', 10000000, '2026-01-05'),
      buildTx('expense', 4000000, '2026-01-20', {
        category: { id: 1, name: 'Ăn uống' },
      }),
      buildTx('income', 6000000, '2026-03-10'),
      buildTx('expense', 1000000, '2026-03-11', {
        category: { id: 1, name: 'Ăn uống' },
      }),
      buildTx('expense', 2000000, '2026-06-01', {
        category: { id: 2, name: 'Giải trí' },
      }),
      buildTx('income', 9000000, '2026-06-02', { isTransfer: true }),
    ];
    transactionRepo.createQueryBuilder().getMany.mockResolvedValueOnce(mockTxs);

    const profile = await service.rebuildProfile(1);

    expect(profile.averageMonthlyIncome).toBe(8000000);
    expect(profile.averageMonthlyExpense).toBe(2500000);
    expect(profile.averageMonthlySavings).toBe(5500000);
    expect(profile.savingsRate).toBeCloseTo(0.6875, 4);
  });

  function buildTx(
    type: 'income' | 'expense',
    amount: number,
    date: string,
    options: {
      isTransfer?: boolean;
      category?: { id: number; name: string };
    } = {},
  ) {
    return {
      id: Number(`${date.replace(/\D/g, '')}${type === 'income' ? 1 : 2}`),
      amount,
      type,
      transaction_date: new Date(`${date}T08:00:00.000Z`),
      isTransfer: options.isTransfer ?? false,
      category: options.category,
    };
  }
});
