import { Test, TestingModule } from '@nestjs/testing';
import { SavingGoalsService } from './saving-goals.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { User } from '../user/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';

describe('SavingGoalsService', () => {
  let service: SavingGoalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
