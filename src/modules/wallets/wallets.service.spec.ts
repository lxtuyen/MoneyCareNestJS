import { BadRequestException } from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { Wallet } from './entities/wallet.entity';
import { User } from '../user/entities/user.entity';

describe('WalletsService', () => {
  let service: WalletsService;
  let walletRepository: { findOne: jest.Mock; save: jest.Mock };

  const user = { id: 1 } as User;

  beforeEach(() => {
    walletRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    service = new WalletsService(
      walletRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('does not remove a wallet with a non-zero balance', async () => {
    walletRepository.findOne.mockResolvedValue({
      id: 10,
      balance: 50000,
      user,
    } as Wallet);

    await expect(service.remove(10, user)).rejects.toThrow(BadRequestException);
    expect(walletRepository.save).not.toHaveBeenCalled();
  });

  it('soft deletes a wallet with zero balance', async () => {
    const wallet = { id: 10, balance: 0, is_active: true, user } as Wallet;
    walletRepository.findOne.mockResolvedValue(wallet);
    walletRepository.save.mockResolvedValue({ ...wallet, is_active: false });

    const result = await service.remove(10, user);

    expect(wallet.is_active).toBe(false);
    expect(walletRepository.save).toHaveBeenCalledWith(wallet);
    expect(result.success).toBe(true);
  });
});
