import { Test, TestingModule } from '@nestjs/testing';
import { EmailTransferController } from './email-transfer.controller';

describe('EmailTransferController', () => {
  let controller: EmailTransferController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmailTransferController],
    }).compile();

    controller = module.get<EmailTransferController>(EmailTransferController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
