import { Test, TestingModule } from '@nestjs/testing';
import { SavingGoalsService } from './saving-goals.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { User } from '../user/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

describe('SavingGoalsService', () => {
  let service: SavingGoalsService;
  let goalRepo: jest.Mocked<Repository<SavingGoal>>;
  let walletRepo: jest.Mocked<Repository<Wallet>>;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;

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
            remove: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SavingGoalsService>(SavingGoalsService);
    goalRepo = module.get(getRepositoryToken(SavingGoal));
    walletRepo = module.get(getRepositoryToken(Wallet));
    transactionRepo = module.get(getRepositoryToken(Transaction));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('remove', () => {
    it('should delete saving goal, transfer transactions, adjust default wallet balance, and delete goal wallet', async () => {
      const mockGoalWallet = { id: 10, balance: 100 } as Wallet;
      const mockDefaultWallet = {
        id: 1,
        name: 'Ví 1',
        balance: 500,
        is_active: true,
      } as Wallet;
      const mockUser = { id: 5 } as User;
      const mockGoal = {
        id: 100,
        user: mockUser,
        wallet: mockGoalWallet,
      } as SavingGoal;

      const mockTransactions = [
        {
          id: 201,
          amount: 200,
          type: 'income',
          wallet: mockGoalWallet,
        } as any as Transaction,
        {
          id: 202,
          amount: 100,
          type: 'expense',
          wallet: mockGoalWallet,
        } as any as Transaction,
      ];

      goalRepo.findOne.mockResolvedValue(mockGoal);
      walletRepo.findOne.mockResolvedValue(mockDefaultWallet);
      transactionRepo.find.mockResolvedValue(mockTransactions);

      const result = await service.remove(100, 5);

      expect(result.success).toBe(true);
      expect(result.data).toBe('Deleted successfully');

      // Verify that transactions were updated to use the default wallet
      expect(mockTransactions[0].wallet).toBe(mockDefaultWallet);
      expect(mockTransactions[1].wallet).toBe(mockDefaultWallet);
      expect(transactionRepo.save).toHaveBeenCalledWith(mockTransactions);

      // Verify default wallet balance adjustment: 500 + (200 - 100) = 600
      expect(mockDefaultWallet.balance).toBe(600);
      expect(walletRepo.save).toHaveBeenCalledWith(mockDefaultWallet);

      // Verify saving goal deletion and goal wallet deletion
      expect(goalRepo.remove).toHaveBeenCalledWith(mockGoal);
      expect(walletRepo.remove).toHaveBeenCalledWith(mockGoalWallet);
    });
  });
});
