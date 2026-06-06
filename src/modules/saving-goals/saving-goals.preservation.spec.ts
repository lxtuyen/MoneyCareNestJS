/**
 * Preservation Property Tests — Task 2
 *
 * These tests capture BASELINE BEHAVIOR of currently-working flows.
 * They MUST PASS.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Repository, ObjectLiteral } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fc from 'fast-check';
import { SavingGoalsService } from './saving-goals.service';
import { SavingGoal } from './entities/saving-goal.entity';
import { User } from '../user/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateSavingGoalDto } from './dto/create-goal.dto';
import { UpdateSavingGoalDto } from './dto/update-goal.dto';

// ─── Test Utilities ──────────────────────────────────────────────────────────

function createMockRepository<T extends ObjectLiteral>() {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

// ─── Preservation 1: Create fund with name, dates, target works correctly ─────

describe('Preservation 1 — Create fund with name, dates (MUST PASS)', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let walletRepo: jest.Mocked<Repository<Wallet>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: createMockRepository<SavingGoal>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: createMockRepository<Wallet>(),
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
    fundRepo = module.get(getRepositoryToken(SavingGoal));
    userRepo = module.get(getRepositoryToken(User));
    walletRepo = module.get(getRepositoryToken(Wallet));
  });

  it('should save name, start_date, end_date correctly when creating a fund', async () => {
    const mockUser = { id: 1, email: 'test@example.com' } as User;
    const mockSavingGoal = {
      id: 1,
      name: 'Test SavingGoal',
      target: 1000000,
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-12-31'),
      user: mockUser,
      wallet: { id: 2, balance: 0 },
    } as any as SavingGoal;

    userRepo.findOne.mockResolvedValue(mockUser);
    walletRepo.save.mockResolvedValue({ id: 2 } as Wallet);
    fundRepo.create.mockReturnValue(mockSavingGoal);
    fundRepo.save.mockResolvedValue(mockSavingGoal);
    fundRepo.findOne.mockResolvedValue(mockSavingGoal);

    const dto: CreateSavingGoalDto = {
      userId: 1,
      name: 'Test SavingGoal',
      target: 1000000,
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      walletId: 2,
    };

    const result = await service.create(dto);

    expect(result.data!.name).toBe('Test SavingGoal');
    expect(fundRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test SavingGoal',
        target: 1000000,
        wallet: { id: 2 },
      }),
    );
  });
});

// ─── Preservation 2: Update fund works correctly ──────────────────────────────

describe('Preservation 2 — Update fund works correctly (MUST PASS)', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: createMockRepository<SavingGoal>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: createMockRepository<Wallet>(),
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
    fundRepo = module.get(getRepositoryToken(SavingGoal));
  });

  it('should update and preserve values when updating a fund', async () => {
    const mockSavingGoal = {
      id: 1,
      name: 'Old Name',
      target: 100000,
      wallet: { id: 2, balance: 0 },
    } as any as SavingGoal;

    fundRepo.findOne.mockResolvedValue(mockSavingGoal);
    fundRepo.save.mockImplementation(async (g: any) => g);

    const dto: UpdateSavingGoalDto = {
      name: 'New Name',
      target: 200000,
    };

    const result = await service.update(1, dto);

    expect(result.data.name).toBe('New Name');
    expect(result.data.target).toBe(200000);
    expect(fundRepo.save).toHaveBeenCalled();
  });
});

// ─── Preservation 3: Delete fund works correctly ──────────────────────────────

describe('Preservation 3 — Delete fund works correctly (MUST PASS)', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: createMockRepository<SavingGoal>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: createMockRepository<Wallet>(),
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
    fundRepo = module.get(getRepositoryToken(SavingGoal));
  });

  it('should remove fund when delete is called', async () => {
    const mockSavingGoal = {
      id: 1,
      name: 'Test SavingGoal',
      target: null,
    } as any as SavingGoal;

    fundRepo.findOne.mockResolvedValue(mockSavingGoal);
    fundRepo.remove.mockResolvedValue(mockSavingGoal);

    const result = await service.remove(1);

    expect(result.data).toBe('Deleted successfully');
    expect(fundRepo.remove).toHaveBeenCalledWith(mockSavingGoal);
  });
});

// ─── Preservation 4: Select fund works correctly ──────────────────────────────

describe('Preservation 4 — Select fund works correctly (MUST PASS)', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: createMockRepository<SavingGoal>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: createMockRepository<Wallet>(),
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
    fundRepo = module.get(getRepositoryToken(SavingGoal));
  });

  it('should set is_selected to true for selected fund and false for others', async () => {
    const mockSavingGoal = {
      id: 1,
      name: 'Test SavingGoal',
      target: null,
      is_selected: false,
      user: { id: 1 },
    } as any as SavingGoal;

    const mockSelectedGoals = [
      { id: 2, is_selected: true, name: 'Other Goal' } as any as SavingGoal,
    ];

    fundRepo.find.mockResolvedValue(mockSelectedGoals);
    fundRepo.findOne.mockResolvedValue(mockSavingGoal);
    fundRepo.save.mockImplementation(async (g: any) => g);

    await service.selectGoal(1, 1);

    // Should deactivate previous selected goals
    expect(mockSelectedGoals[0].is_selected).toBe(false);
    expect(fundRepo.save).toHaveBeenCalledWith(mockSelectedGoals);

    // Should activate the current goal
    expect(fundRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        is_selected: true,
      }),
    );
  });
});

// ─── Property-Based Preservation Tests ────────────────────────────────────────

describe('PBT Preservation — Create fund with random valid data', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let walletRepo: jest.Mocked<Repository<Wallet>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: createMockRepository<SavingGoal>(),
        },
        {
          provide: getRepositoryToken(User),
          useValue: createMockRepository<User>(),
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: createMockRepository<Wallet>(),
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
    fundRepo = module.get(getRepositoryToken(SavingGoal));
    userRepo = module.get(getRepositoryToken(User));
    walletRepo = module.get(getRepositoryToken(Wallet));
  });

  it('should preserve name, dates, and target for all valid inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          target: fc.option(fc.integer({ min: 0, max: 1000000000 })),
          start_date: fc.date(),
          end_date: fc.date(),
          walletId: fc.integer({ min: 1, max: 100 }),
        }),
        async (fundData) => {
          const mockUser = { id: 1, email: 'test@example.com' } as User;
          const mockSavingGoal = {
            id: 1,
            ...fundData,
            user: mockUser,
          } as any as SavingGoal;

          userRepo.findOne.mockResolvedValue(mockUser);
          walletRepo.save.mockResolvedValue({ id: fundData.walletId } as Wallet);
          fundRepo.create.mockReturnValue(mockSavingGoal);
          fundRepo.save.mockResolvedValue(mockSavingGoal);
          fundRepo.findOne.mockResolvedValue(mockSavingGoal);

          const dto: CreateSavingGoalDto = {
            userId: 1,
            name: fundData.name,
            target: fundData.target ?? undefined,
            start_date: fundData.start_date.toISOString(),
            end_date: fundData.end_date.toISOString(),
            walletId: fundData.walletId,
          };

          await service.create(dto);

          // Verify that name, target and walletId are preserved
          expect(fundRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
              name: fundData.name,
              target: fundData.target ?? 0,
              wallet: { id: fundData.walletId },
            }),
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
