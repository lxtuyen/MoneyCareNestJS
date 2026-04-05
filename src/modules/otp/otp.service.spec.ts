import { Test, TestingModule } from '@nestjs/testing';
import { OtpService } from './otp.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OTP } from './entities/otp.entity';
import { User } from '../user/entities/user.entity';
import { MailService } from '../mailer/mail.service';

describe('OtpService', () => {
  let service: OtpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: getRepositoryToken(OTP), useValue: { create: jest.fn(), save: jest.fn(), findOne: jest.fn(), remove: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: MailService, useValue: { sendOtpEmail: jest.fn() } },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
