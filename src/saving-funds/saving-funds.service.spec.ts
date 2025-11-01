import { Test, TestingModule } from '@nestjs/testing';
import { SavingFundsService } from './saving-funds.service';

describe('SavingFundsService', () => {
  let service: SavingFundsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SavingFundsService],
    }).compile();

    service = module.get<SavingFundsService>(SavingFundsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
