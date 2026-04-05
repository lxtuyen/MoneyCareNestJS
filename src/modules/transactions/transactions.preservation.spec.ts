/**
 * Preservation Property Tests for Transactions — Task 2
 *
 * These tests capture BASELINE BEHAVIOR of transaction-related flows.
 * They MUST PASS on unfixed code (before implementing the fix).
 * After the fix, they MUST STILL PASS (no regression).
 *
 * **Validates: Requirements 3.4, 3.5**
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as fc from 'fast-check';
import { TransactionService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Fund } from '../saving-funds/entities/fund.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { GetTransactionDto } from './dto/get-transaction.dto';

// ─── Test Utilities ──────────────────────────────────────────────────────────

function createMockRepository<T>() {
  return {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<T>>;
}

function createMockQueryBuilder() {
  const mockQueryBuilder = {
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getRawOne: jest.fn(),
    getMany: jest.fn(),
  };
  return mockQueryBuilder as unknown as jest.Mocked<SelectQueryBuilder<any>>;
}

// ─── Preservation 5: Sum by category aggregation works correctly ──────────────

/**
 * Preservation: Requirement 3.4
 *
 * WHEN the system displays total spending by category
 * THEN the system SHALL CONTINUE TO aggregate transaction amounts correctly
 *
 * This behavior must remain unchanged after the fix.
 */
describe('Preservation 5 — Sum by category aggregation (MUST PASS on unfixed code)', () => {
  let service: TransactionService;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;
  let categoryRepo: jest.Mocked<Repository<Category>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
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
          provide: getRepositoryToken(Fund),
          useValue: createMockRepository<Fund>(),
        },
        {
          provide: NotificationsService,
          useValue: {
            sendPushNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    transactionRepo = module.get(getRepositoryToken(Transaction));
    categoryRepo = module.get(getRepositoryToken(Category));
  });

  it('should aggregate transaction amounts by category correctly', async () => {
    const mockCategoryQueryBuilder = createMockQueryBuilder();
    const mockTransactionQueryBuilder = createMockQueryBuilder();

    categoryRepo.createQueryBuilder.mockReturnValue(mockCategoryQueryBuilder);
    transactionRepo.createQueryBuilder.mockReturnValue(mockTransactionQueryBuilder);

    // Mock category data — service uses 'balance' (from fund.balance) for limit calculation
    mockCategoryQueryBuilder.getRawMany.mockResolvedValue([
      {
        categoryId: 1,
        categoryName: 'Food',
        percentage: 30,
        categoryIcon: 'food-icon',
        balance: '10000000',
      },
      {
        categoryId: 2,
        categoryName: 'Transport',
        percentage: 20,
        categoryIcon: 'transport-icon',
        balance: '10000000',
      },
    ]);

    // Mock transaction totals
    mockTransactionQueryBuilder.getRawMany.mockResolvedValue([
      { categoryId: 1, total: '2500000' },
      { categoryId: 2, total: '1500000' },
    ]);

    const dto: GetTransactionDto = {
      userId: 1,
    };

    const result = await service.sumByCategory(dto);

    // Verify aggregation is correct
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        categoryName: 'Food',
        categoryIcon: 'food-icon',
        percentage: 30,
        limit: 3000000, // (30 * 10000000) / 100
        total: 2500000,
      }),
    );
    expect(result.data[1]).toEqual(
      expect.objectContaining({
        categoryName: 'Transport',
        categoryIcon: 'transport-icon',
        percentage: 20,
        limit: 2000000, // (20 * 10000000) / 100
        total: 1500000,
      }),
    );
  });

  it('should handle categories with no transactions', async () => {
    const mockCategoryQueryBuilder = createMockQueryBuilder();
    const mockTransactionQueryBuilder = createMockQueryBuilder();

    categoryRepo.createQueryBuilder.mockReturnValue(mockCategoryQueryBuilder);
    transactionRepo.createQueryBuilder.mockReturnValue(mockTransactionQueryBuilder);

    mockCategoryQueryBuilder.getRawMany.mockResolvedValue([
      {
        categoryId: 1,
        categoryName: 'Food',
        percentage: 30,
        categoryIcon: 'food-icon',
        balance: '10000000',
      },
    ]);

    // No transactions for this category
    mockTransactionQueryBuilder.getRawMany.mockResolvedValue([]);

    const dto: GetTransactionDto = {
      userId: 1,
    };

    const result = await service.sumByCategory(dto);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].total).toBe(0);
  });
});

// ─── Preservation 6: Filter transactions by fundId works correctly ────────────

/**
 * Preservation: Requirement 3.3
 *
 * WHEN users select a saving fund
 * THEN the system SHALL CONTINUE TO filter transactions by the selected fund
 *
 * This behavior must remain unchanged after the fix.
 */
describe('Preservation 6 — Filter transactions by fundId (MUST PASS on unfixed code)', () => {
  let service: TransactionService;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;
  let categoryRepo: jest.Mocked<Repository<Category>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: createMockRepository<Transaction>(),
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
          provide: getRepositoryToken(Fund),
          useValue: createMockRepository<Fund>(),
        },
        {
          provide: NotificationsService,
          useValue: {
            sendPushNotification: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
    transactionRepo = module.get(getRepositoryToken(Transaction));
    categoryRepo = module.get(getRepositoryToken(Category));
  });

  it('should filter categories by fundId when provided', async () => {
    const mockCategoryQueryBuilder = createMockQueryBuilder();
    const mockTransactionQueryBuilder = createMockQueryBuilder();

    categoryRepo.createQueryBuilder.mockReturnValue(mockCategoryQueryBuilder);
    transactionRepo.createQueryBuilder.mockReturnValue(mockTransactionQueryBuilder);

    mockCategoryQueryBuilder.getRawMany.mockResolvedValue([
      {
        categoryId: 1,
        categoryName: 'Food',
        percentage: 30,
        categoryIcon: 'food-icon',
        balance: '10000000',
      },
    ]);

    mockTransactionQueryBuilder.getRawMany.mockResolvedValue([
      { categoryId: 1, total: '2500000' },
    ]);

    const dto: GetTransactionDto = {
      userId: 1,
      fundId: 5,
    };

    await service.sumByCategory(dto);

    // Verify that fundId filter is applied
    expect(mockCategoryQueryBuilder.andWhere).toHaveBeenCalledWith(
      'fund.id = :fundId',
      { fundId: 5 },
    );
  });
});

// ─── Property-Based Preservation Tests ────────────────────────────────────────

/**
 * Property-Based Preservation: Requirement 3.4
 *
 * For ALL valid category and transaction data:
 * - The system MUST aggregate amounts correctly
 * - The limit calculation MUST use the formula: (percentage * amount) / 100
 * - The behavior MUST be identical before and after the fix
 *
 * **Validates: Requirements 3.4**
 */
describe('PBT Preservation — Sum by category with random data', () => {
  it('should correctly calculate limits and totals for all valid inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          categories: fc.array(
            fc.record({
              categoryId: fc.integer({ min: 1, max: 100 }),
              categoryName: fc.string({ minLength: 1, maxLength: 50 }),
              percentage: fc.integer({ min: 0, max: 100 }),
              categoryIcon: fc.string({ minLength: 1, maxLength: 50 }),
              amount: fc.integer({ min: 0, max: 100000000 }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          transactions: fc.array(
            fc.record({
              categoryId: fc.integer({ min: 1, max: 100 }),
              total: fc.integer({ min: 0, max: 10000000 }),
            }),
            { maxLength: 10 },
          ),
        }),
        async ({ categories, transactions }) => {
          const module: TestingModule = await Test.createTestingModule({
            providers: [
              TransactionService,
              {
                provide: getRepositoryToken(Transaction),
                useValue: createMockRepository<Transaction>(),
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
                provide: getRepositoryToken(Fund),
                useValue: createMockRepository<Fund>(),
              },
              {
                provide: NotificationsService,
                useValue: {
                  sendPushNotification: jest.fn(),
                },
              },
            ],
          }).compile();

          const service = module.get<TransactionService>(TransactionService);
          const transactionRepo = module.get<jest.Mocked<Repository<Transaction>>>(
            getRepositoryToken(Transaction),
          );
          const categoryRepo = module.get<jest.Mocked<Repository<Category>>>(
            getRepositoryToken(Category),
          );

          const mockCategoryQueryBuilder = createMockQueryBuilder();
          const mockTransactionQueryBuilder = createMockQueryBuilder();

          categoryRepo.createQueryBuilder.mockReturnValue(mockCategoryQueryBuilder);
          transactionRepo.createQueryBuilder.mockReturnValue(mockTransactionQueryBuilder);

          // Convert to string format as returned by database
          // Service uses 'balance' (from fund.balance) for limit calculation
          const categoryData = categories.map((cat) => ({
            ...cat,
            balance: cat.amount.toString(), // map 'amount' to 'balance' as the service expects
          }));

          const transactionData = transactions.map((tx) => ({
            ...tx,
            total: tx.total.toString(),
          }));

          mockCategoryQueryBuilder.getRawMany.mockResolvedValue(categoryData);
          mockTransactionQueryBuilder.getRawMany.mockResolvedValue(transactionData);

          const dto: GetTransactionDto = {
            userId: 1,
          };

          const result = await service.sumByCategory(dto);

          // Verify that limit calculation is correct for each category
          // Service formula: (percentage * balance) / 100
          result.data.forEach((item) => {
            const category = categories.find((c) => c.categoryName === item.categoryName);
            if (category) {
              const expectedLimit = (category.percentage * category.amount) / 100;
              expect(item.limit).toBe(expectedLimit);
              expect(item.percentage).toBe(category.percentage);
            }
          });
        },
      ),
      { numRuns: 30 },
    );
  });
});

/**
 * Property-Based Preservation: Requirement 3.5
 *
 * For ALL existing saving fund data:
 * - The system MUST preserve the amount field (which will be mapped to balance)
 * - The behavior MUST be identical before and after the fix
 *
 * **Validates: Requirements 3.5**
 */
describe('PBT Preservation — Existing data preservation', () => {
  it('should preserve amount field for all existing funds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            categoryId: fc.integer({ min: 1, max: 100 }),
            categoryName: fc.string({ minLength: 1, maxLength: 50 }),
            percentage: fc.integer({ min: 0, max: 100 }),
            categoryIcon: fc.string({ minLength: 1, maxLength: 50 }),
            amount: fc.integer({ min: 0, max: 100000000 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (categories) => {
          const module: TestingModule = await Test.createTestingModule({
            providers: [
              TransactionService,
              {
                provide: getRepositoryToken(Transaction),
                useValue: createMockRepository<Transaction>(),
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
                provide: getRepositoryToken(Fund),
                useValue: createMockRepository<Fund>(),
              },
              {
                provide: NotificationsService,
                useValue: {
                  sendPushNotification: jest.fn(),
                },
              },
            ],
          }).compile();

          const service = module.get<TransactionService>(TransactionService);
          const transactionRepo = module.get<jest.Mocked<Repository<Transaction>>>(
            getRepositoryToken(Transaction),
          );
          const categoryRepo = module.get<jest.Mocked<Repository<Category>>>(
            getRepositoryToken(Category),
          );

          const mockCategoryQueryBuilder = createMockQueryBuilder();
          const mockTransactionQueryBuilder = createMockQueryBuilder();

          categoryRepo.createQueryBuilder.mockReturnValue(mockCategoryQueryBuilder);
          transactionRepo.createQueryBuilder.mockReturnValue(mockTransactionQueryBuilder);

          const categoryData = categories.map((cat) => ({
            ...cat,
            balance: cat.amount.toString(), // map 'amount' to 'balance' as the service expects
          }));

          mockCategoryQueryBuilder.getRawMany.mockResolvedValue(categoryData);
          mockTransactionQueryBuilder.getRawMany.mockResolvedValue([]);

          const dto: GetTransactionDto = {
            userId: 1,
          };

          const result = await service.sumByCategory(dto);

          // Verify that amount field is used in limit calculation
          // This confirms that existing data (amount → balance) is preserved and used correctly
          result.data.forEach((item) => {
            const category = categories.find((c) => c.categoryName === item.categoryName);
            if (category) {
              const expectedLimit = (category.percentage * category.amount) / 100;
              expect(item.limit).toBe(expectedLimit);
            }
          });
        },
      ),
      { numRuns: 30 },
    );
  });
});
