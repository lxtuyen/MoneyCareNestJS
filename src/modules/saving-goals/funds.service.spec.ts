import { Test, TestingModule } from '@nestjs/testing';
import { FundsService } from './funds.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Fund } from './entities/fund.entity';
import { User } from '../user/entities/user.entity';
import { Category } from '../categories/entities/category.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

const mockQueryBuilder = {
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  leftJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  getOne: jest.fn().mockResolvedValue(null),
  getMany: jest.fn().mockResolvedValue([]),
  update: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({}),
};

describe('FundsService', () => {
  let service: FundsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FundsService,
        {
          provide: getRepositoryToken(Fund),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Category),
          useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn(), update: jest.fn() },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<FundsService>(FundsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
