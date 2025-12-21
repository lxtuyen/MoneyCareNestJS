import { Test, TestingModule } from '@nestjs/testing';
import { SavingFundsController } from './saving-funds.controller';
import { SavingFundsService } from './saving-funds.service';

describe('SavingFundsController', () => {
  let controller: SavingFundsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SavingFundsController],
      providers: [SavingFundsService],
    }).compile();

    controller = module.get<SavingFundsController>(SavingFundsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
