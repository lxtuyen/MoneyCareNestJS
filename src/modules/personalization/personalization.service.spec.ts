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

  beforeEach(async () => {
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

  it('should compile successfully', () => {
    expect(service).toBeDefined();
  });

  it('should build a profile with insufficient_data when transaction count is low', async () => {
    const profile = await service.rebuildProfile(1);
    expect(profile).toBeDefined();
    expect(profile.spendingStyle).toBe('insufficient_data');
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
    expect(profile.averageMonthlyIncome).toBeGreaterThan(0);
    expect(profile.averageMonthlyExpense).toBeGreaterThan(0);
    expect(profile.savingsRate).toBeGreaterThan(0.5);
    expect(profile.riskLevel).toBe('low');
  });
});
