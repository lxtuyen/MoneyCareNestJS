import { Test, TestingModule } from '@nestjs/testing';
import { SavingGoalsController } from './saving-goals.controller';
import { SavingGoalsService } from './saving-goals.service';

describe('SavingGoalsController', () => {
  let controller: SavingGoalsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavingGoalsController],
      providers: [
        {
          provide: SavingGoalsService,
          useValue: {
            create: jest.fn(),
            findAllByUser: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
            selectGoal: jest.fn(),
            checkExpiredGoal: jest.fn(),
            markAsNotified: jest.fn(),
            extendGoal: jest.fn(),
            getGoalReport: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<SavingGoalsController>(SavingGoalsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
