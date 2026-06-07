import { Test, TestingModule } from '@nestjs/testing';
import { GamificationService } from './gamification.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GamificationEntity } from './entities/gamification.entity';

describe('GamificationService', () => {
  let service: GamificationService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamificationService,
        {
          provide: getRepositoryToken(GamificationEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<GamificationService>(GamificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('recordDay', () => {
    it('should award badge and save to repo', async () => {
      const existingRecord = new GamificationEntity();
      existingRecord.userId = 1;
      existingRecord.currentStreak = 1;
      existingRecord.lastTransactionDate = '2026-06-07';
      existingRecord.badges = [];

      mockRepo.findOne.mockResolvedValue(existingRecord);
      mockRepo.save.mockImplementation(async (x: any) => x);

      const response = await service.recordDay(1, {
        date: '2026-06-07',
        badge: {
          key: 'streak_7',
          name: 'Tiết kiệm 7 ngày',
          awardedAt: '2026-06-07T00:00:00.000Z',
        },
      });

      expect(response.success).toBe(true);
      expect(response.data.badges).toHaveLength(1);
      expect(response.data.badges[0].key).toBe('streak_7');
      expect(mockRepo.save).toHaveBeenCalledWith(existingRecord);
    });
  });
});
