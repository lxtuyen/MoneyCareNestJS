import { Test, TestingModule } from '@nestjs/testing';
import { CouplesController } from './couples.controller';
import { CouplesService } from './couples.service';
import { JoinCoupleDto } from './dto/join-couple.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CoupleResponseDto } from './dto/couple-response.dto';

describe('CouplesController', () => {
  let controller: CouplesController;
  let service: jest.Mocked<CouplesService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CouplesController],
      providers: [
        {
          provide: CouplesService,
          useValue: {
            create: jest.fn(),
            join: jest.fn(),
            cancelInvite: jest.fn(),
            leaveCouple: jest.fn(),
            getMe: jest.fn(),
            updateSettings: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<CouplesController>(CouplesController);
    service = module.get(CouplesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const mockResult = new CoupleResponseDto();
      service.create.mockResolvedValue(mockResult);

      const result = await controller.create(1);

      expect(service.create).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data).toBe(mockResult);
    });
  });

  describe('join', () => {
    it('should delegate to service.join', async () => {
      const mockResult = new CoupleResponseDto();
      service.join.mockResolvedValue(mockResult);
      const dto: JoinCoupleDto = { inviteCode: 'ABC123' };

      const result = await controller.join(1, dto);

      expect(service.join).toHaveBeenCalledWith(1, 'ABC123');
      expect(result.success).toBe(true);
      expect(result.data).toBe(mockResult);
    });
  });

  describe('cancelInvite', () => {
    it('should delegate to service.cancelInvite', async () => {
      service.cancelInvite.mockResolvedValue(undefined);

      const result = await controller.cancelInvite(1);

      expect(service.cancelInvite).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
    });
  });

  describe('leaveCouple', () => {
    it('should delegate to service.leaveCouple', async () => {
      service.leaveCouple.mockResolvedValue(undefined);

      const result = await controller.leaveCouple(1);

      expect(service.leaveCouple).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
    });
  });

  describe('getMe', () => {
    it('should delegate to service.getMe', async () => {
      const mockResult = new CoupleResponseDto();
      service.getMe.mockResolvedValue(mockResult);

      const result = await controller.getMe(1);

      expect(service.getMe).toHaveBeenCalledWith(1);
      expect(result.success).toBe(true);
      expect(result.data).toBe(mockResult);
    });
  });

  describe('updateSettings', () => {
    it('should delegate to service.updateSettings', async () => {
      const mockResult = new CoupleResponseDto();
      service.updateSettings.mockResolvedValue(mockResult);
      const dto: UpdateSettingsDto = { sharePersonalTransactions: true };

      const result = await controller.updateSettings(1, dto);

      expect(service.updateSettings).toHaveBeenCalledWith(1, dto);
      expect(result.success).toBe(true);
      expect(result.data).toBe(mockResult);
    });
  });
});
