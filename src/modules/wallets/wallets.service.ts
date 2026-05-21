import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import {
  CreateWalletDto,
  UpdateWalletDto,
  TransferDto,
} from './dto/wallet.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { CacheService } from 'src/common/cache/cache.service';
import {
  getFinancialCacheKeys,
  getAiAnalysisRegistryKeys,
} from 'src/common/cache/financial-cache.util';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Category)
    private categoryRepository: Repository<Category>,
    @InjectRepository(SavingGoal)
    private goalRepo: Repository<SavingGoal>,
    private cacheService: CacheService,
  ) {}

  async create(createWalletDto: CreateWalletDto, user: User): Promise<Wallet> {
    const existingWallets = await this.walletRepository.find({
      where: { user: { id: user.id } },
    });

    const wallet = this.walletRepository.create({
      ...createWalletDto,
      user,
    });
    return this.walletRepository.save(wallet);
  }

  async findAll(user: User): Promise<Wallet[]> {
    return this.walletRepository.find({
      where: { user: { id: user.id }, is_active: true },
      order: { created_at: 'DESC' },
      relations: ['savingGoals'],
    });
  }

  async findOne(id: number, user: User): Promise<Wallet> {
    const wallet = await this.walletRepository.findOne({
      where: { id, user: { id: user.id } },
      relations: ['savingGoals'],
    });
    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${id} not found`);
    }
    return wallet;
  }

  async update(
    id: number,
    updateWalletDto: UpdateWalletDto,
    user: User,
  ): Promise<Wallet> {
    const wallet = await this.findOne(id, user);

    Object.assign(wallet, updateWalletDto);
    return this.walletRepository.save(wallet);
  }

  async remove(id: number, user: User): Promise<void> {
    const wallet = await this.findOne(id, user);
    wallet.is_active = false;
    await this.walletRepository.save(wallet);
  }

  async transfer(transferDto: TransferDto, user: User): Promise<void> {
    const {
      fromWalletId,
      toWalletId,
      amount,
      fee = 0,
      note,
      categoryId,
    } = transferDto;

    const fromWallet = await this.findOne(fromWalletId, user);
    const toWallet = await this.findOne(toWalletId, user);

    let category: Category | null = null;
    if (categoryId) {
      category = await this.categoryRepository.findOne({
        where: { id: categoryId },
      });
    }

    if (Number(fromWallet.balance) < amount + fee) {
      throw new Error('Số dư không đủ để thực hiện chuyển khoản');
    }

    // 1. Update balances
    fromWallet.balance = Number(fromWallet.balance) - (amount + fee);
    toWallet.balance = Number(toWallet.balance) + amount;
    await this.walletRepository.save([fromWallet, toWallet]);

    // 2. Record transactions for history
    const now = new Date();

    // Outgoing transaction from source wallet
    const outgoing = this.transactionRepository.create({
      amount: amount + fee,
      type: 'expense',
      transaction_date: now,
      note: note || `Chuyển tiền đến ${toWallet.name}`,
      user: user,
      wallet: fromWallet,
      category: category,
      isTransfer: true,
    });

    // Incoming transaction to target wallet
    const incoming = this.transactionRepository.create({
      amount: amount,
      type: 'income',
      transaction_date: now,
      note: note || `Nhận tiền từ ${fromWallet.name}`,
      user: user,
      wallet: toWallet,
      category: category,
      isTransfer: true,
    });

    await this.transactionRepository.save([outgoing, incoming]);

    // 3. Find and invalidate cache for goals linked to fromWallet or toWallet
    try {
      const goals = await this.goalRepo.find({
        where: [
          { wallet: { id: fromWalletId } },
          { wallet: { id: toWalletId } },
        ],
      });
      const affectedGoalIds = goals.map((g) => g.id);
      if (affectedGoalIds.length > 0) {
        await this.invalidateFinancialCache(user.id, affectedGoalIds);
      }
    } catch (cacheError) {
      // Non-blocking catch to ensure transfer is not rolled back if cache invalidation fails
      console.error(
        '>>> [BE] Error invalidating financial cache during transfer:',
        cacheError,
      );
    }
  }

  private async invalidateFinancialCache(
    userId: number,
    goalIds: number[],
  ): Promise<void> {
    const keys = getFinancialCacheKeys(userId, [0, ...goalIds]);
    await this.cacheService.delMany(keys);

    const registryKeys = getAiAnalysisRegistryKeys(userId, [0, ...goalIds]);
    const registryEntries = await Promise.all(
      registryKeys.map((registryKey) =>
        this.cacheService.get<string[]>(registryKey),
      ),
    );

    const analysisKeys = Array.from(
      new Set(registryEntries.flatMap((entry) => entry ?? [])),
    );

    await this.cacheService.delMany([...analysisKeys, ...registryKeys]);
  }

  async getTotalAssets(user: User): Promise<number> {
    const wallets = await this.findAll(user);
    return wallets.reduce((total, wallet) => total + Number(wallet.balance), 0);
  }
}
