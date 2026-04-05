import { Test, TestingModule } from '@nestjs/testing';
import { ReceiptService } from './receipt.service';
import { AiGeminiReceiptService } from './ai-gemini-receipt.service';

describe('ReceiptService', () => {
  let service: ReceiptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptService,
        {
          provide: AiGeminiReceiptService,
          useValue: { scan: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ReceiptService>(ReceiptService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
