import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Category } from '../categories/entities/category.entity';
import { Place, PlaceSource, PlaceStatus } from '../recommendations/entities/place.entity';
import { AdminPlacesService } from './admin-places.service';

describe('AdminPlacesService', () => {
  let service: AdminPlacesService;
  const placeRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 1, ...value })),
    count: jest.fn(async () => 0),
    findOne: jest.fn(),
  };
  const categoryRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminPlacesService,
        { provide: getRepositoryToken(Place), useValue: placeRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
      ],
    }).compile();

    service = module.get(AdminPlacesService);
  });

  it('creates admin suggested places as active by default', async () => {
    const result = await service.create(7, {
      name: 'Cafe Test',
      address: '123 Test',
      latitude: 10.1,
      longitude: 106.1,
    });

    expect(placeRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source: PlaceSource.ADMIN_CREATED,
        status: PlaceStatus.ACTIVE,
        isSystemSuggested: true,
        createdBy: { id: 7 },
      }),
    );
    expect(result.data.source).toBe(PlaceSource.ADMIN_CREATED);
  });

  it('counts pending places in dashboard stats', async () => {
    placeRepo.count
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(4);

    const result = await service.getStats();

    expect(placeRepo.count).toHaveBeenNthCalledWith(4, {
      where: { status: PlaceStatus.PENDING },
    });
    expect(result).toEqual({
      totalPlaces: 8,
      userPlaces: 3,
      systemSuggestedPlaces: 2,
      pendingPlaces: 1,
      hiddenPlaces: 4,
    });
  });

  it('approves pending places as active', async () => {
    placeRepo.findOne.mockResolvedValue({
      id: 9,
      name: 'Pending Cafe',
      normalizedName: 'pending cafe',
      status: PlaceStatus.PENDING,
      hiddenReason: null,
    });

    const result = await service.approve(9);

    expect(placeRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 9,
        status: PlaceStatus.ACTIVE,
        hiddenReason: null,
      }),
    );
    expect(result.data.status).toBe(PlaceStatus.ACTIVE);
  });
});
