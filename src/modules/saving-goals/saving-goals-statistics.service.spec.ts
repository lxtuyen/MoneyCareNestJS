import { Test, TestingModule } from '@nestjs/testing';
import { SavingGoalsStatisticsService } from './saving-goals-statistics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SavingGoal } from './entities/saving-goal.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { NotFoundException } from '@nestjs/common';

describe('SavingGoalsStatisticsService', () => {
  let service: SavingGoalsStatisticsService;
  let goalRepo: any;
  let txRepo: any;
  let walletRepo: any;
  let spendingPlansService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavingGoalsStatisticsService,
        {
          provide: getRepositoryToken(SavingGoal),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            update: jest.fn(),
          },
        },
        {
          provide: SpendingPlansService,
          useValue: {
            getMonthlySavingCapacity: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SavingGoalsStatisticsService>(
      SavingGoalsStatisticsService,
    );
    goalRepo = module.get(getRepositoryToken(SavingGoal));
    txRepo = module.get(getRepositoryToken(Transaction));
    walletRepo = module.get(getRepositoryToken(Wallet));
    spendingPlansService = module.get(SpendingPlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getGoalReport', () => {
    it('should throw NotFoundException if goal not found', async () => {
      goalRepo.findOne.mockResolvedValue(null);
      await expect(service.getGoalReport(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return report data successfully when goal exists', async () => {
      const mockGoal = {
        id: 1,
        name: 'Mua xe',
        target: 10000000,
        start_date: new Date('2026-01-01'),
        end_date: new Date('2026-12-31'),
        user: { id: 1 },
        wallet: { id: 12, balance: 2000000, name: 'Ví tiết kiệm mua xe' },
        is_completed: false,
        completion_notified: false,
      } as any;

      goalRepo.findOne.mockResolvedValue(mockGoal);

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 101,
            amount: 3000000,
            type: 'income',
            transaction_date: new Date('2026-02-15'),
            wallet: { id: 12 },
          },
          {
            id: 102,
            amount: 1000000,
            type: 'expense',
            transaction_date: new Date('2026-03-10'),
            wallet: { id: 12 },
            category: { name: 'Ăn uống' },
          },
        ]),
      };
      txRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      spendingPlansService.getMonthlySavingCapacity.mockResolvedValue({
        monthlySavingCapacity: 1000000,
      });

      const result = await service.getGoalReport(1, 1);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(1);
      expect(result.data.current_balance).toBe(2000000);
      expect(result.data.target).toBe(10000000);
      expect(result.data.progress_percent).toBe(20);
      expect(result.data.totalSpent).toBe(1000000);
      expect(result.data.projection.monthlySavingCapacity).toBe(1000000);
      expect(result.data.projection.monthsRemaining).toBe(8); // (10m - 2m) / 1m = 8 months
    });
  });
});
