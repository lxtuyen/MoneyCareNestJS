import { Test, TestingModule } from '@nestjs/testing';
import { CoupleSettlementService } from './couple-settlement.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CoupleMember } from './entities/couple-member.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { TransactionSplit } from 'src/modules/transactions/entities/transaction-split.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Repository } from 'typeorm';
import { ForbiddenException } from '@nestjs/common';

describe('CoupleSettlementService', () => {
  let service: CoupleSettlementService;
  let coupleMemberRepo: jest.Mocked<Repository<CoupleMember>>;
  let transactionRepo: jest.Mocked<Repository<Transaction>>;
  let splitRepo: jest.Mocked<Repository<TransactionSplit>>;
  let userRepo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoupleSettlementService,
        {
          provide: getRepositoryToken(CoupleMember),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {
            find: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TransactionSplit),
          useValue: {
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CoupleSettlementService>(CoupleSettlementService);
    coupleMemberRepo = module.get(getRepositoryToken(CoupleMember));
    transactionRepo = module.get(getRepositoryToken(Transaction));
    splitRepo = module.get(getRepositoryToken(TransactionSplit));
    userRepo = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getSettlementSummary', () => {
    it('should throw ForbiddenException if requester is not in the couple', async () => {
      coupleMemberRepo.findOne.mockResolvedValue(null);

      await expect(service.getSettlementSummary(1, 99)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return empty summary if couple has less than 2 members', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({ id: 1 } as CoupleMember);
      coupleMemberRepo.find.mockResolvedValue([{ id: 1 } as CoupleMember]);

      const result = await service.getSettlementSummary(1, 1);
      expect(result.success).toBe(true);
      expect(result.data.whoOwesWhom).toBeNull();
      expect(result.data.netBalance).toHaveLength(0);
    });

    it('should calculate that B owes A $50 when A pays $100 split 50/50', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        coupleId: 1,
      } as CoupleMember);

      const mockMembers = [
        {
          userId: 1,
          user: {
            id: 1,
            email: 'userA@test.com',
            profile: { first_name: 'User', last_name: 'A' },
          } as any,
        } as CoupleMember,
        {
          userId: 2,
          user: {
            id: 2,
            email: 'userB@test.com',
            profile: { first_name: 'User', last_name: 'B' },
          } as any,
        } as CoupleMember,
      ];
      coupleMemberRepo.find.mockResolvedValue(mockMembers);

      const mockTransaction = {
        id: 10,
        amount: 100,
        payerId: 1,
        splitMethod: 'equal',
        settlementStatus: 'unsettled',
        splits: [
          { userId: 1, amount: 50, percent: 50, user: mockMembers[0].user },
          { userId: 2, amount: 50, percent: 50, user: mockMembers[1].user },
        ],
      } as any;

      transactionRepo.find.mockResolvedValue([mockTransaction]);

      const result = await service.getSettlementSummary(1, 1);

      expect(result.success).toBe(true);
      expect(result.data.whoOwesWhom).toEqual({
        debtorId: 2,
        debtorName: 'User B',
        creditorId: 1,
        creditorName: 'User A',
        amount: 50,
      });
      expect(result.data.netBalance).toContainEqual({
        userId: 1,
        userName: 'User A',
        netAmount: 50,
      });
      expect(result.data.netBalance).toContainEqual({
        userId: 2,
        userName: 'User B',
        netAmount: -50,
      });
    });

    it('should calculate that A owes B $60 when B pays $100 and split is A owes 60%, B owes 40%', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        coupleId: 1,
      } as CoupleMember);

      const mockMembers = [
        {
          userId: 1,
          user: {
            id: 1,
            email: 'userA@test.com',
            profile: { first_name: 'User', last_name: 'A' },
          } as any,
        } as CoupleMember,
        {
          userId: 2,
          user: {
            id: 2,
            email: 'userB@test.com',
            profile: { first_name: 'User', last_name: 'B' },
          } as any,
        } as CoupleMember,
      ];
      coupleMemberRepo.find.mockResolvedValue(mockMembers);

      const mockTransaction = {
        id: 11,
        amount: 100,
        payerId: 2,
        splitMethod: 'percentage',
        settlementStatus: 'unsettled',
        splits: [
          { userId: 1, amount: 60, percent: 60, user: mockMembers[0].user },
          { userId: 2, amount: 40, percent: 40, user: mockMembers[1].user },
        ],
      } as any;

      transactionRepo.find.mockResolvedValue([mockTransaction]);

      const result = await service.getSettlementSummary(1, 1);

      expect(result.success).toBe(true);
      expect(result.data.whoOwesWhom).toEqual({
        debtorId: 1,
        debtorName: 'User A',
        creditorId: 2,
        creditorName: 'User B',
        amount: 60,
      });
    });
  });

  describe('settleUp', () => {
    it('should update all unsettled split transactions to settled status', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        coupleId: 1,
      } as CoupleMember);

      const mockTransactions = [
        { id: 10, settlementStatus: 'unsettled' } as Transaction,
        { id: 11, settlementStatus: 'unsettled' } as Transaction,
      ];

      transactionRepo.find.mockResolvedValue(mockTransactions);
      transactionRepo.save.mockResolvedValue(mockTransactions);

      const result = await service.settleUp(1, 1);

      expect(result.success).toBe(true);
      expect(mockTransactions[0].settlementStatus).toBe('settled');
      expect(mockTransactions[0].settledById).toBe(1);
      expect(mockTransactions[1].settlementStatus).toBe('settled');
      expect(mockTransactions[1].settledById).toBe(1);
      expect(transactionRepo.save).toHaveBeenCalledWith(mockTransactions);
    });
  });

  describe('settleUpSingle', () => {
    it('should update a specific unsettled split transaction to settled status', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        coupleId: 1,
      } as CoupleMember);

      const mockTransaction = {
        id: 10,
        settlementStatus: 'unsettled',
      } as Transaction;
      transactionRepo.findOne = jest.fn().mockResolvedValue(mockTransaction);
      transactionRepo.save.mockResolvedValue(mockTransaction);

      const result = await service.settleUpSingle(1, 10, 1);

      expect(result.success).toBe(true);
      expect(mockTransaction.settlementStatus).toBe('settled');
      expect(mockTransaction.settledById).toBe(1);
      expect(transactionRepo.save).toHaveBeenCalledWith(mockTransaction);
    });

    it('should throw ForbiddenException if transaction not found or already settled', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({
        id: 1,
        userId: 1,
        coupleId: 1,
      } as CoupleMember);

      transactionRepo.findOne = jest.fn().mockResolvedValue(null);

      await expect(service.settleUpSingle(1, 10, 1)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
