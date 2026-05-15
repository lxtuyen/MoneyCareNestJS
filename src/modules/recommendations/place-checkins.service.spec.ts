import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Transaction } from '../transactions/entities/transaction.entity';
import { PlaceAggregateStats } from './entities/place-aggregate-stats.entity';
import { PlaceCheckin } from './entities/place-checkin.entity';
import { PlaceSource, PlaceStatus } from './entities/place.entity';
import { PlaceCheckinsService } from './place-checkins.service';
import { PlacesService } from './places.service';

describe('PlaceCheckinsService', () => {
  let service: PlaceCheckinsService;

  const checkinRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 11, ...value })),
    find: jest.fn(async () => []),
  };
  const statsRepo = {
    findOne: jest.fn(async () => null),
    remove: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const transactionRepo = {
    findOne: jest.fn(),
  };
  const placesService = {
    findById: jest.fn(),
    upsertPlace: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaceCheckinsService,
        { provide: getRepositoryToken(PlaceCheckin), useValue: checkinRepo },
        {
          provide: getRepositoryToken(PlaceAggregateStats),
          useValue: statsRepo,
        },
        { provide: getRepositoryToken(Transaction), useValue: transactionRepo },
        { provide: PlacesService, useValue: placesService },
      ],
    }).compile();

    service = module.get(PlaceCheckinsService);
  });

  it('creates user supplied places as pending during check-in', async () => {
    transactionRepo.findOne.mockResolvedValue({
      id: 5,
      amount: 75000,
      note: 'Lunch',
      transaction_date: new Date('2026-05-15T04:00:00.000Z'),
      user: { id: 7 },
    });
    placesService.upsertPlace.mockResolvedValue({
      id: 21,
      provider: 'manual',
      providerPlaceId: null,
      name: 'Quan moi',
      address: '64 Huynh Van Nghe',
      latitude: 10.1,
      longitude: 106.1,
      categories: [],
      status: PlaceStatus.PENDING,
    });

    const result = await service.create(7, {
      transactionId: 5,
      place: {
        provider: 'manual',
        name: 'Quan moi',
        address: '64 Huynh Van Nghe',
        latitude: 10.1,
        longitude: 106.1,
      },
      rating: 5,
      wantToReturn: true,
    });

    expect(placesService.upsertPlace).toHaveBeenCalledWith(
      expect.objectContaining({
        source: PlaceSource.USER_CREATED,
        status: PlaceStatus.PENDING,
        createdById: 7,
      }),
    );
    expect(result.data.place.status).toBe(PlaceStatus.PENDING);
  });
});
