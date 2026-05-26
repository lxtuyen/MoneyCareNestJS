import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { CategoriesService } from './categories.service';
import { SYSTEM_CATEGORY_SEEDS } from './categories.seed';
import { Category, CategoryType } from './entities/category.entity';
import { SubCategory } from './entities/sub-category.entity';
import { UserCategoryPreference } from './entities/user-category-preference.entity';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let categoryRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let userRepo: { findOne: jest.Mock };
  let preferenceRepo: {
    find: jest.Mock;
    remove: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };

  beforeEach(async () => {
    categoryRepo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    userRepo = { findOne: jest.fn() };
    preferenceRepo = {
      find: jest.fn(),
      remove: jest.fn(),
      save: jest.fn(),
      create: jest.fn((value) => value),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: getRepositoryToken(Category),
          useValue: categoryRepo,
        },
        {
          provide: getRepositoryToken(SubCategory),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOne: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: userRepo,
        },
        {
          provide: getRepositoryToken(UserCategoryPreference),
          useValue: preferenceRepo,
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not include saving or fixed-cost categories as system defaults', () => {
    const names = SYSTEM_CATEGORY_SEEDS.map((category) => category.name);

    expect(names).not.toContain('Tiết kiệm');
    expect(names).not.toContain('Chi phí cố định');
    expect(names.length).toBeGreaterThan(0);
  });

  it('stores essential expense preferences without mutating categories', async () => {
    userRepo.findOne.mockResolvedValueOnce({ id: 1 });
    categoryRepo.find.mockResolvedValueOnce([
      { id: 10, type: CategoryType.EXPENSE, isEssential: false },
      { id: 11, type: CategoryType.EXPENSE, isEssential: true },
    ]);
    preferenceRepo.find.mockResolvedValueOnce([
      { id: 1, category: { id: 7, type: CategoryType.EXPENSE } },
    ]);

    const result = await service.updateEssentialExpensePreferences(1, {
      categoryIds: [10, 11],
    });

    expect(preferenceRepo.remove).toHaveBeenCalled();
    expect(preferenceRepo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        user: { id: 1 },
        category: expect.objectContaining({ id: 10 }),
        isEssential: true,
      }),
      expect.objectContaining({
        user: { id: 1 },
        category: expect.objectContaining({ id: 11 }),
        isEssential: true,
      }),
    ]);
    expect(categoryRepo.save).not.toHaveBeenCalled();
    expect(result.data).toEqual({ categoryIds: [10, 11] });
  });

  it('rejects non-expense category ids for essential preferences', async () => {
    userRepo.findOne.mockResolvedValueOnce({ id: 1 });
    categoryRepo.find.mockResolvedValueOnce([]);

    await expect(
      service.updateEssentialExpensePreferences(1, { categoryIds: [20] }),
    ).rejects.toThrow(BadRequestException);
  });
});
