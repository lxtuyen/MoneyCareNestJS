import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptController } from './receipt.controller';
import { ReceiptService } from './receipt.service';

describe('ReceiptController', () => {
  let controller: ReceiptController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReceiptController],
      providers: [
        {
          provide: ReceiptService,
          useValue: { scan: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<ReceiptController>(ReceiptController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
