import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransactionService } from './transactions.service';
import { Transaction } from './entities/transaction.entity';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Fund } from '../saving-funds/entities/fund.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { CacheService } from 'src/common/cache/cache.service';
import {
  buildAiAnalysisRegistryKey,
  getFinancialCacheKeys,
} from 'src/common/cache/financial-cache.util';

describe('TransactionsService', () => {
  let module: TestingModule;
  let service: TransactionService;
  let transactionRepo: any;
  let userRepo: any;
  let categoryRepo: any;
  let cacheService: any;

  beforeEach(async () => {
    transactionRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue(null),
        getRawMany: jest.fn().mockResolvedValue([]),
        getMany: jest.fn().mockResolvedValue([]),
      }),
    };
    userRepo = { findOne: jest.fn() };
    categoryRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      }),
    };
    cacheService = {
      get: jest.fn(),
      delMany: jest.fn().mockResolvedValue(undefined),
      delByPrefix: jest.fn(),
    };

    module = await Test.createTestingModule({
      providers: [
        TransactionService,
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactionRepo,
        },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(Fund), useValue: { findOne: jest.fn() } },
        {
          provide: NotificationsService,
          useValue: { sendPushNotification: jest.fn() },
        },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile();

    service = module.get<TransactionService>(TransactionService);
  });

  it('module compiles without circular dependency error', () => {
    expect(module).toBeDefined();
  });

  it('invalidates financial and AI registry caches on create without prefix scan', async () => {
    const user = { id: 10 };
    const transaction = {
      id: 1,
      amount: 1000,
      type: 'income',
      user,
      category: null,
    };
    const registryKey = buildAiAnalysisRegistryKey(10, 0);

    userRepo.findOne.mockResolvedValueOnce(user);
    transactionRepo.create.mockReturnValueOnce(transaction);
    transactionRepo.save.mockResolvedValueOnce(transaction);
    cacheService.get.mockResolvedValueOnce(['analysis:key:1']);

    await service.create({
      userId: 10,
      amount: 1000,
      type: 'income',
      note: 'salary',
    } as any);

    expect(cacheService.delMany).toHaveBeenNthCalledWith(
      1,
      getFinancialCacheKeys(10, [0, 0]),
    );
    expect(cacheService.get).toHaveBeenCalledWith(registryKey);
    expect(cacheService.delMany).toHaveBeenNthCalledWith(2, [
      'analysis:key:1',
      registryKey,
    ]);
    expect(cacheService.delByPrefix).not.toHaveBeenCalled();
  });

  it('invalidates old and new fund AI registries on update', async () => {
    const transaction = {
      id: 3,
      amount: 500,
      type: 'expense',
      note: 'old',
      pictuteURL: null,
      transaction_date: new Date(),
      user: { id: 5 },
      category: { id: 100, fund: { id: 1 } },
    };
    const newCategory = { id: 200, fund: { id: 2 } };
    const registryKeys = [
      buildAiAnalysisRegistryKey(5, 0),
      buildAiAnalysisRegistryKey(5, 1),
      buildAiAnalysisRegistryKey(5, 2),
    ];

    transactionRepo.findOne.mockResolvedValueOnce(transaction);
    categoryRepo.findOne.mockResolvedValueOnce(newCategory);
    transactionRepo.save.mockResolvedValueOnce({
      ...transaction,
      category: newCategory,
    });
    cacheService.get
      .mockResolvedValueOnce(['analysis:key:0'])
      .mockResolvedValueOnce(['analysis:key:1'])
      .mockResolvedValueOnce(['analysis:key:2']);

    await service.update(3, { categoryId: 200 } as any);

    expect(cacheService.delMany).toHaveBeenNthCalledWith(
      1,
      getFinancialCacheKeys(5, [0, 1, 2]),
    );
    expect(cacheService.get.mock.calls.map(([key]: [string]) => key)).toEqual(
      registryKeys,
    );
    expect(cacheService.delMany).toHaveBeenNthCalledWith(2, [
      'analysis:key:0',
      'analysis:key:1',
      'analysis:key:2',
      ...registryKeys,
    ]);
    expect(cacheService.delByPrefix).not.toHaveBeenCalled();
  });

  it('invalidates registry-backed AI analysis cache on remove', async () => {
    const transaction = {
      id: 9,
      user: { id: 11 },
      category: { fund: { id: 6 } },
    };
    const registryKeys = [
      buildAiAnalysisRegistryKey(11, 0),
      buildAiAnalysisRegistryKey(11, 6),
    ];

    transactionRepo.findOne.mockResolvedValueOnce(transaction);
    transactionRepo.remove.mockResolvedValueOnce(transaction);
    cacheService.get
      .mockResolvedValueOnce(['analysis:key:0'])
      .mockResolvedValueOnce(['analysis:key:6']);

    await service.remove(9);

    expect(cacheService.delMany).toHaveBeenNthCalledWith(
      1,
      getFinancialCacheKeys(11, [0, 6]),
    );
    expect(cacheService.delMany).toHaveBeenNthCalledWith(2, [
      'analysis:key:0',
      'analysis:key:6',
      ...registryKeys,
    ]);
    expect(cacheService.delByPrefix).not.toHaveBeenCalled();
  });
});
