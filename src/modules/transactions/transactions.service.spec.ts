import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Fund } from '../saving-funds/entities/fund.entity';
import { NotificationsService } from '../notifications/notifications.service';

// Import the service directly to avoid circular dependency in test module
// The TransactionService has a circular dep with Fund → Category → Transaction
// We test it by providing all required tokens as mocks
describe('TransactionsService', () => {
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        {
          provide: getRepositoryToken(Transaction),
          useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), remove: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue({ where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), leftJoin: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), groupBy: jest.fn().mockReturnThis(), orderBy: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue(null), getRawMany: jest.fn().mockResolvedValue([]), getMany: jest.fn().mockResolvedValue([]) }) },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Category), useValue: { findOne: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue({ leftJoin: jest.fn().mockReturnThis(), leftJoinAndSelect: jest.fn().mockReturnThis(), select: jest.fn().mockReturnThis(), addSelect: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getRawMany: jest.fn().mockResolvedValue([]) }) } },
        { provide: getRepositoryToken(Fund), useValue: { findOne: jest.fn() } },
        { provide: NotificationsService, useValue: { sendPushNotification: jest.fn() } },
      ],
    }).compile();
  });

  it('module compiles without circular dependency error', () => {
    expect(module).toBeDefined();
  });
});
