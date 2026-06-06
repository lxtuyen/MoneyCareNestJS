import { Test, TestingModule } from '@nestjs/testing';
import { TransactionController } from './transactions.controller';
import { TransactionService } from './transactions.service';
import { TransactionExportService } from './transactions-export.service';
import { TransactionStatisticsService } from './transactions-statistics.service';

describe('TransactionsController', () => {
  let controller: TransactionController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        {
          provide: TransactionService,
          useValue: {
            create: jest.fn(),
            update: jest.fn(),
            findAllByFilter: jest.fn(),
            sumByDay: jest.fn(),
            getTotalsByType: jest.fn(),
            sumByCategory: jest.fn(),
            getStatisticsSummary: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: TransactionExportService,
          useValue: {
            exportAndSendEmail: jest.fn(),
          },
        },
        {
          provide: TransactionStatisticsService,
          useValue: {
            sumByDay: jest.fn(),
            getTotalsByType: jest.fn(),
            sumByCategory: jest.fn(),
            getStatisticsSummary: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
