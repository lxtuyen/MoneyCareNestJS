import { Test, TestingModule } from '@nestjs/testing';
import { EmailTransferService } from './email-transfer.service';

describe('EmailTransferService', () => {
  let service: EmailTransferService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailTransferService],
    }).compile();

    service = module.get<EmailTransferService>(EmailTransferService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
