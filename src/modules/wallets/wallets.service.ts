import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { UpdateWalletDto, TransferDto } from './dto/wallet.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Category } from '../categories/entities/category.entity';
import { SavingGoal } from '../saving-goals/entities/saving-goal.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { FinancialCacheInvalidationService } from 'src/common/cache/financial-cache-invalidation.service';

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
    private financialCacheInvalidationService: FinancialCacheInvalidationService,
  ) {}

  async create(user: User): Promise<ApiResponse<Wallet>> {
    const walletCount = await this.walletRepository.count({
      where: { user: { id: user.id }, is_active: true },
    });
    const wallet = this.walletRepository.create({
      name: `Ví ${walletCount + 1}`,
      balance: 0,
      user,
    });
    const savedWallet = await this.walletRepository.save(wallet);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.CREATED,
      data: savedWallet,
      message: 'Tạo ví thành công',
    });
  }

  async findAll(user: User): Promise<ApiResponse<Wallet[]>> {
    const wallets = await this.walletRepository.find({
      where: { user: { id: user.id }, is_active: true },
      order: { created_at: 'DESC' },
      relations: ['savingGoals'],
    });

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: wallets,
    });
  }

  async findOne(id: number, user: User): Promise<ApiResponse<Wallet>> {
    const wallet = await this.findWalletOrThrow(id, user);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: wallet,
    });
  }

  private async findWalletOrThrow(id: number, user: User): Promise<Wallet> {
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
  ): Promise<ApiResponse<Wallet>> {
    const wallet = await this.findWalletOrThrow(id, user);

    Object.assign(wallet, updateWalletDto);
    const savedWallet = await this.walletRepository.save(wallet);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: savedWallet,
      message: 'Cập nhật ví thành công',
    });
  }

  async remove(id: number, user: User): Promise<ApiResponse<void>> {
    const wallet = await this.findWalletOrThrow(id, user);

    if (Number(wallet.balance) !== 0) {
      throw new BadRequestException('Không thể xóa ví đang có số dư');
    }

    wallet.is_active = false;
    await this.walletRepository.save(wallet);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa ví thành công',
    });
  }

  async transfer(
    transferDto: TransferDto,
    user: User,
  ): Promise<ApiResponse<void>> {
    const { fromWalletId, toWalletId, amount, note, categoryId } = transferDto;

    if (fromWalletId === toWalletId) {
      throw new BadRequestException('Không thể chuyển tiền cùng một ví');
    }

    const fromWallet = await this.findWalletOrThrow(fromWalletId, user);
    const toWallet = await this.findWalletOrThrow(toWalletId, user);

    let category: Category | null = null;
    if (categoryId) {
      category = await this.categoryRepository.findOne({
        where: { id: categoryId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    if (Number(fromWallet.balance) < amount) {
      throw new BadRequestException('Số dư không đủ để thực hiện chuyển khoản');
    }

    fromWallet.balance = Number(fromWallet.balance) - amount;
    toWallet.balance = Number(toWallet.balance) + amount;
    await this.walletRepository.save([fromWallet, toWallet]);

    const now = new Date();

    const outgoing = this.transactionRepository.create({
      amount: amount,
      type: 'expense',
      transaction_date: now,
      note: note || `Chuyển tiền đến ${toWallet.name}`,
      user: user,
      wallet: fromWallet,
      category: category,
      isTransfer: true,
    });

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

    try {
      const goals = await this.goalRepo.find({
        where: [
          { wallet: { id: fromWalletId } },
          { wallet: { id: toWalletId } },
        ],
      });
      const affectedGoalIds = goals.map((g) => g.id);
      if (affectedGoalIds.length > 0) {
        await this.financialCacheInvalidationService.invalidate(
          user.id,
          affectedGoalIds,
        );
      }
    } catch (cacheError) {
      console.error(
        '>>> [BE] Error invalidating financial cache during transfer:',
        cacheError,
      );
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Chuyển khoản thành công',
    });
  }

  async getTotalAssets(user: User): Promise<ApiResponse<number>> {
    const wallets = await this.walletRepository.find({
      where: { user: { id: user.id }, is_active: true },
    });
    const total = wallets.reduce(
      (sum, wallet) => sum + Number(wallet.balance),
      0,
    );

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: total,
    });
  }
}
