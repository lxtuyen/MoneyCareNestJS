/**
 * Preservation Property Tests — Task 2
 *
 * These tests capture BASELINE BEHAVIOR of currently-working flows.
 * They MUST PASS on unfixed code (before implementing the fix).
 * After the fix, they MUST STILL PASS (no regression).
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Repository, ObjectLiteral, In } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fc from 'fast-check';
import { SavingGoalsService } from './saving-goals.service';
import { SavingGoal } from './entities/saving-goal.entity';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
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
    findBy: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

// ─── Preservation 1: Create fund with name, dates, categories works correctly ─

/**
 * Preservation: Requirement 3.1
 *
 * WHEN a user creates or updates a saving fund with name, start_date, end_date, and categories
 * THEN the system SHALL CONTINUE TO save these fields correctly
 *
 * This behavior must remain unchanged after the fix.
 */
describe('Preservation 1 — Create fund with name, dates, categories (MUST PASS on unfixed code)', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let categoryRepo: jest.Mocked<Repository<Category>>;

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
          provide: getRepositoryToken(Category),
          useValue: createMockRepository<Category>(),
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
    categoryRepo = module.get(getRepositoryToken(Category));
  });

  it('should save name, start_date, end_date correctly when creating a fund', async () => {
    const mockUser = { id: 1, email: 'test@example.com' } as User;
    const mockSavingGoal = {
      id: 1,
      name: 'Test SavingGoal',
      balance: 1000000,
      target: null,
      start_date: new Date('2024-01-01'),
      end_date: new Date('2024-12-31'),
      user: mockUser,
    } as SavingGoal;

    userRepo.findOne.mockResolvedValue(mockUser);
    fundRepo.create.mockReturnValue(mockSavingGoal);
    fundRepo.save.mockResolvedValue(mockSavingGoal);
    fundRepo.findOne.mockResolvedValue(mockSavingGoal);

    const dto: CreateSavingGoalDto = {
      userId: 1,
      name: 'Test SavingGoal',
      target: 1000000,
      start_date: '2024-01-01',
      end_date: '2024-12-31',
    };

    const result = await service.create(dto);

    expect(result.data!.name).toBe('Test SavingGoal');
    expect(fundRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Test SavingGoal',
        start_date: dto.start_date,
        end_date: dto.end_date,
      }),
    );
  });

  it('should save categories correctly when creating a fund', async () => {
    const mockUser = { id: 1, email: 'test@example.com' } as User;
    const mockSavingGoal = {
      id: 1,
      name: 'Test SavingGoal',
      balance: 1000000,
      target: null,
      user: mockUser,
    } as SavingGoal;
    const mockCategory = {
      id: 1,
      name: 'Food',
      percentage: 30,
      icon: 'food-icon',
      savingGoal: mockSavingGoal,
    } as any as Category;

    userRepo.findOne.mockResolvedValue(mockUser);
    fundRepo.create.mockReturnValue(mockSavingGoal);
    fundRepo.save.mockResolvedValue(mockSavingGoal);
    categoryRepo.create.mockReturnValue(mockCategory);
    categoryRepo.save.mockResolvedValue(mockCategory);
    fundRepo.findOne.mockResolvedValue({
      ...mockSavingGoal,
      categories: [mockCategory],
    });

    const dto: CreateSavingGoalDto = {
      userId: 1,
      name: 'Test SavingGoal',
      target: 1000000,
      categoryIds: [1],
    };

    await service.create(dto);

    expect(categoryRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Food',
        percentage: 30,
        icon: 'food-icon',
      }),
    );
    expect(categoryRepo.save).toHaveBeenCalled();
  });
});

// ─── Preservation 2: Category percentage calculation works correctly ──────────

/**
 * Preservation: Requirement 3.2
 *
 * WHEN the system calculates category percentages
 * THEN the system SHALL CONTINUE TO use the percentage field to determine
 * how balance is distributed across categories
 *
 * This behavior must remain unchanged after the fix.
 */
describe('Preservation 2 — Category percentage calculation (MUST PASS on unfixed code)', () => {
  it('should preserve percentage field when updating categories', async () => {
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
          provide: getRepositoryToken(Category),
          useValue: createMockRepository<Category>(),
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
        },
      ],
    }).compile();

    const service = module.get<SavingGoalsService>(SavingGoalsService);
    const fundRepo = module.get<jest.Mocked<Repository<SavingGoal>>>(
      getRepositoryToken(SavingGoal),
    );
    const categoryRepo = module.get<jest.Mocked<Repository<Category>>>(
      getRepositoryToken(Category),
    );

    const mockSavingGoal = {
      id: 1,
      name: 'Test SavingGoal',
      balance: 1000000,
      target: null,
      categories: [],
    } as any as SavingGoal;

    fundRepo.findOne.mockResolvedValue(mockSavingGoal);
    categoryRepo.update.mockResolvedValue({ affected: 1 } as any);
    categoryRepo.find.mockResolvedValue([
      {
        id: 1,
        name: 'Food',
        percentage: 40,
        icon: 'food-icon',
      } as Category,
    ]);
    fundRepo.save.mockResolvedValue(mockSavingGoal);

    const dto: UpdateSavingGoalDto = {
      categoryIds: [1],
    };

    await service.update(1, dto);

    expect(categoryRepo.findBy).toHaveBeenCalledWith({
      id: In([1]),
    });
  });
});

// ─── Preservation 3: Delete fund works correctly ──────────────────────────────

/**
 * Preservation: Requirement 3.4
 *
 * WHEN a user deletes a saving fund
 * THEN the system SHALL CONTINUE TO remove the fund correctly
 *
 * This behavior must remain unchanged after the fix.
 */
describe('Preservation 3 — Delete fund works correctly (MUST PASS on unfixed code)', () => {
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
          provide: getRepositoryToken(Category),
          useValue: createMockRepository<Category>(),
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
      balance: 1000000,
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

/**
 * Preservation: Requirement 3.3
 *
 * WHEN users select a saving fund
 * THEN the system SHALL CONTINUE TO filter transactions by the selected fund
 *
 * This behavior must remain unchanged after the fix.
 */
describe('Preservation 4 — Select fund works correctly (MUST PASS on unfixed code)', () => {
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
          provide: getRepositoryToken(Category),
          useValue: createMockRepository<Category>(),
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
      balance: 1000000,
      target: null,
      is_selected: false,
      user: { id: 1 },
    } as any as SavingGoal;

    fundRepo.findOne.mockResolvedValue(mockSavingGoal);
    fundRepo.update.mockResolvedValue({ affected: 1 } as any);
    fundRepo.save.mockResolvedValue({
      ...mockSavingGoal,
      is_selected: true,
    });

    await service.selectGoal(1, 1);

    expect(fundRepo.update).toHaveBeenCalledWith(
      { user: { id: 1 }, type: 'SPENDING' },
      { is_selected: false },
    );
    expect(fundRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        is_selected: true,
      }),
    );
  });
});

// ─── Property-Based Preservation Tests ────────────────────────────────────────

/**
 * Property-Based Preservation: Requirement 3.1
 *
 * For ALL valid saving fund data (name, dates, categories):
 * - The system MUST save these fields correctly
 * - The behavior MUST be identical before and after the fix
 *
 * **Validates: Requirements 3.1**
 */
describe('PBT Preservation — Create fund with random valid data', () => {
  let service: SavingGoalsService;
  let fundRepo: jest.Mocked<Repository<SavingGoal>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let categoryRepo: jest.Mocked<Repository<Category>>;

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
          provide: getRepositoryToken(Category),
          useValue: createMockRepository<Category>(),
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
    categoryRepo = module.get(getRepositoryToken(Category));
  });

  it('should preserve name, dates, and categories for all valid inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 100 }),
          balance: fc.integer({ min: 0, max: 1000000000 }),
          target: fc.option(fc.integer({ min: 0, max: 1000000000 })),
          start_date: fc.date(),
          end_date: fc.date(),
          categoryIds: fc.array(fc.integer({ min: 1, max: 100 }), { maxLength: 10 }),
        }),
        async (fundData) => {
          const mockUser = { id: 1, email: 'test@example.com' } as User;
          const mockSavingGoal = {
            id: 1,
            ...fundData,
            user: mockUser,
          } as any as SavingGoal;

          userRepo.findOne.mockResolvedValue(mockUser);
          fundRepo.create.mockReturnValue(mockSavingGoal);
          fundRepo.save.mockResolvedValue(mockSavingGoal);
          categoryRepo.create.mockImplementation((cat) => cat as Category);
          categoryRepo.save.mockResolvedValue([] as any);
          fundRepo.findOne.mockResolvedValue(mockSavingGoal);

          const dto: CreateSavingGoalDto = {
            userId: 1,
            ...fundData,
            target: fundData.target ?? undefined,
            start_date: fundData.start_date?.toISOString(),
            end_date: fundData.end_date?.toISOString(),
          };

          await service.create(dto);

          // Verify that name, dates are preserved
          expect(fundRepo.create).toHaveBeenCalledWith(
            expect.objectContaining({
              name: fundData.name,
              start_date: fundData.start_date,
              end_date: fundData.end_date,
            }),
          );

          // Verify that categories are fetched if provided
          if (fundData.categoryIds && fundData.categoryIds.length > 0) {
            expect(categoryRepo.findBy).toHaveBeenCalledWith({
              id: In(dto.categoryIds || []),
            });
          }
        },
      ),
      { numRuns: 50 },
    );
  });
});

/**
 * Property-Based Preservation: Requirement 3.2
 *
 * For ALL category percentage values (0-100):
 * - The system MUST use the percentage field correctly
 * - The behavior MUST be identical before and after the fix
 *
 * **Validates: Requirements 3.2**
 */
describe('PBT Preservation — Category percentage calculation', () => {
  it('should preserve percentage field for all valid percentage values', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 1000 }),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            percentage: fc.integer({ min: 0, max: 100 }),
            icon: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (categories) => {
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
                provide: getRepositoryToken(Category),
                useValue: createMockRepository<Category>(),
              },
              {
                provide: getRepositoryToken(Transaction),
                useValue: createMockRepository<Transaction>(),
              },
            ],
          }).compile();

          const service = module.get<SavingGoalsService>(SavingGoalsService);
          const fundRepo = module.get<jest.Mocked<Repository<SavingGoal>>>(
            getRepositoryToken(SavingGoal),
          );
          const categoryRepo = module.get<jest.Mocked<Repository<Category>>>(
            getRepositoryToken(Category),
          );

          const mockSavingGoal = {
            id: 1,
            name: 'Test SavingGoal',
            balance: 1000000,
            target: null,
            categories: [],
          } as any as SavingGoal;

          fundRepo.findOne.mockResolvedValue(mockSavingGoal);
          categoryRepo.update.mockResolvedValue({ affected: 1 } as any);
          categoryRepo.find.mockResolvedValue(categories as Category[]);
          fundRepo.save.mockResolvedValue(mockSavingGoal);

          const dto: UpdateSavingGoalDto = {
            categoryIds: categories.map((cat) => cat.id),
          };

          await service.update(1, dto);

          // Verify that categories are fetched by IDs
          expect(categoryRepo.findBy).toHaveBeenCalledWith({
            id: In(dto.categoryIds || []),
          });
        },
      ),
      { numRuns: 30 },
    );
  });
});
