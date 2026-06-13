import { Test, TestingModule } from '@nestjs/testing';
import { CouplesService } from './couples.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Couple, CoupleStatus } from './entities/couple.entity';
import { CoupleMember, CoupleRole } from './entities/couple-member.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Repository } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('CouplesService', () => {
  let service: CouplesService;
  let coupleRepo: jest.Mocked<Repository<Couple>>;
  let coupleMemberRepo: jest.Mocked<Repository<CoupleMember>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let walletRepo: jest.Mocked<Repository<Wallet>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CouplesService,
        {
          provide: getRepositoryToken(Couple),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(CoupleMember),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            create: jest.fn().mockImplementation((dto) => dto),
            save: jest
              .fn()
              .mockImplementation((entity) => Promise.resolve(entity)),
          },
        },
      ],
    }).compile();

    service = module.get<CouplesService>(CouplesService);
    coupleRepo = module.get(getRepositoryToken(Couple));
    coupleMemberRepo = module.get(getRepositoryToken(CoupleMember));
    userRepo = module.get(getRepositoryToken(User));
    walletRepo = module.get(getRepositoryToken(Wallet));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw BadRequestException if user is already in a couple', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({ id: 1 } as CoupleMember);

      await expect(service.create(1)).rejects.toThrow(BadRequestException);
    });

    it('should successfully create a pending couple space', async () => {
      coupleMemberRepo.findOne.mockResolvedValue(null);
      coupleRepo.create.mockReturnValue({
        id: 1,
        inviteCode: 'ABC123',
        status: CoupleStatus.PENDING,
      } as Couple);
      coupleRepo.save.mockResolvedValue({
        id: 1,
        inviteCode: 'ABC123',
        status: CoupleStatus.PENDING,
      } as Couple);
      coupleMemberRepo.create.mockReturnValue({
        id: 2,
        userId: 1,
        role: CoupleRole.OWNER,
      } as CoupleMember);

      const populatedCouple = {
        id: 1,
        inviteCode: 'ABC123',
        status: CoupleStatus.PENDING,
        members: [
          {
            userId: 1,
            role: CoupleRole.OWNER,
            sharePersonalTransactions: false,
            allowAiShare: false,
            joinedAt: new Date(),
            user: { email: 'user1@test.com' } as User,
          } as CoupleMember,
        ],
      } as Couple;

      coupleRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(populatedCouple);

      const result = await service.create(1);

      expect(result).toBeDefined();
      expect(result.inviteCode).toBe('ABC123');
      expect(result.status).toBe('pending');
      expect(result.members).toHaveLength(1);
    });
  });

  describe('join', () => {
    it('should throw BadRequestException if joiner is already in a couple', async () => {
      coupleMemberRepo.findOne.mockResolvedValue({ id: 1 } as CoupleMember);

      await expect(service.join(2, 'ABC123')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if invite code is invalid', async () => {
      coupleMemberRepo.findOne.mockResolvedValue(null);
      coupleRepo.findOne.mockResolvedValue(null);

      await expect(service.join(2, 'INVALID')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should successfully join an existing pending couple space', async () => {
      coupleMemberRepo.findOne.mockResolvedValue(null);

      const mockCouple = {
        id: 1,
        inviteCode: 'ABC123',
        status: CoupleStatus.PENDING,
        members: [{ userId: 1, role: CoupleRole.OWNER } as CoupleMember],
      } as Couple;

      coupleRepo.findOne
        .mockResolvedValueOnce(mockCouple) // first call in join
        .mockResolvedValueOnce({
          ...mockCouple,
          status: CoupleStatus.ACTIVE,
          members: [
            {
              userId: 1,
              role: CoupleRole.OWNER,
              user: { email: 'owner@test.com' },
            } as any,
            {
              userId: 2,
              role: CoupleRole.PARTNER,
              user: { email: 'partner@test.com' },
            } as any,
          ],
        }); // second call in join (populated retrieve)

      coupleMemberRepo.create.mockReturnValue({
        id: 3,
        userId: 2,
        role: CoupleRole.PARTNER,
      } as CoupleMember);

      const result = await service.join(2, 'ABC123');

      expect(result.status).toBe('active');
      expect(result.members).toHaveLength(2);
      expect(coupleRepo.save).toHaveBeenCalled();
    });
  });

  describe('canAccessPartnerData', () => {
    it('should return true if requestUserId is same as targetUserId', async () => {
      const access = await service.canAccessPartnerData(1, 1, 'api');
      expect(access).toBe(true);
    });

    it('should return false if they are not in the same couple', async () => {
      coupleMemberRepo.findOne.mockResolvedValue(null);

      const access = await service.canAccessPartnerData(1, 2, 'api');
      expect(access).toBe(false);
    });

    it('should respect privacy settings when they are in the same active couple', async () => {
      const activeCoupleMember = {
        coupleId: 10,
        userId: 2,
        sharePersonalTransactions: true,
        allowAiShare: false,
      } as CoupleMember;

      coupleMemberRepo.findOne
        .mockResolvedValueOnce(activeCoupleMember) // target search
        .mockResolvedValueOnce({ coupleId: 10, userId: 1 } as CoupleMember); // requester search

      const apiAccess = await service.canAccessPartnerData(1, 2, 'api');
      expect(apiAccess).toBe(true);

      // Reset mock state for next test call
      coupleMemberRepo.findOne
        .mockResolvedValueOnce(activeCoupleMember)
        .mockResolvedValueOnce({ coupleId: 10, userId: 1 } as CoupleMember);

      const aiAccess = await service.canAccessPartnerData(1, 2, 'ai');
      expect(aiAccess).toBe(false);
    });
  });
});
