import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { User } from 'src/modules/user/entities/user.entity';
import { Category } from 'src/modules/categories/entities/category.entity';
import { SubCategory } from 'src/modules/categories/entities/sub-category.entity';
import { SavingGoal } from 'src/modules/saving-goals/entities/saving-goal.entity';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { TransactionFilterDto } from './dto/transaction-filter.dto';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { FinancialCacheInvalidationService } from 'src/common/cache/financial-cache-invalidation.service';
import { buildTransactionBaseQuery } from './transaction-query.util';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(SubCategory)
    private subCategoryRepo: Repository<SubCategory>,
    @InjectRepository(SavingGoal)
    private goalRepo: Repository<SavingGoal>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    private financialCacheInvalidationService: FinancialCacheInvalidationService,
  ) {}

  async create(dto: CreateTransactionDto): Promise<ApiResponse<Transaction>> {
    const [user, requestedCategory, subCategory] = await Promise.all([
      this.userRepo.findOne({ where: { id: dto.userId } }),
      dto.categoryId
        ? this.categoryRepo.findOne({
            where: { id: dto.categoryId },
          })
        : Promise.resolve(null),
      dto.subCategoryId
        ? this.subCategoryRepo.findOne({
            where: { id: dto.subCategoryId },
            relations: ['category'],
          })
        : Promise.resolve(null),
    ]);

    if (!user) throw new NotFoundException('User not found');
    if (dto.categoryId && !requestedCategory) {
      throw new NotFoundException('Category not found');
    }
    if (dto.subCategoryId && !subCategory) {
      throw new NotFoundException('Sub category not found');
    }
    const category = requestedCategory ?? subCategory?.category ?? null;
    if (
      requestedCategory &&
      subCategory &&
      subCategory.category?.id !== requestedCategory.id
    ) {
      throw new BadRequestException('Sub category does not belong to category');
    }

    let transactionDate: Date;
    if (dto.transactionDate) {
      transactionDate = new Date(dto.transactionDate);
      if (isNaN(transactionDate.getTime())) {
        transactionDate = new Date();
      }
    } else {
      transactionDate = new Date();
    }

    const transaction = this.transactionRepo.create({
      amount: dto.amount,
      type: dto.type,
      note: dto.note,
      transaction_date: transactionDate,
      user,
      category,
      subCategory,
      wallet: dto.walletId ? ({ id: dto.walletId } as any) : null,
      pictureURL: dto.pictureURL,
    });

    if (dto.walletId) {
      const wallet = await this.walletRepo.findOne({
        where: { id: dto.walletId },
      });
      if (wallet) {
        const amt = Number(dto.amount);
        wallet.balance =
          dto.type === 'income'
            ? Number(wallet.balance) + amt
            : Number(wallet.balance) - amt;
        await this.walletRepo.save(wallet);
      }
    }

    await this.transactionRepo.save(transaction);

    let affectedGoalIds: number[] = [];
    if (dto.walletId) {
      const goals = await this.goalRepo.find({
        where: { wallet: { id: dto.walletId } },
      });
      affectedGoalIds = goals.map((g) => g.id);
    }
    await this.financialCacheInvalidationService.invalidate(
      user.id,
      affectedGoalIds,
    );

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async update(
    id: number,
    dto: UpdateTransactionDto,
  ): Promise<ApiResponse<Transaction>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'subCategory', 'user', 'wallet'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    let oldGoalIds: number[] = [];
    if (transaction.wallet) {
      const oldGoals = await this.goalRepo.find({
        where: { wallet: { id: transaction.wallet.id } },
      });
      oldGoalIds = oldGoals.map((g) => g.id);
    }

    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId },
      });
      if (!category) throw new NotFoundException('Category not found');
      transaction.category = category;
    } else if (dto.categoryId === null) {
      transaction.category = null;
    }
    if (dto.subCategoryId) {
      const subCategory = await this.subCategoryRepo.findOne({
        where: { id: dto.subCategoryId },
        relations: ['category'],
      });
      if (!subCategory) throw new NotFoundException('Sub category not found');
      const nextCategory = dto.categoryId
        ? transaction.category
        : subCategory.category;
      if (nextCategory && subCategory.category?.id !== nextCategory.id) {
        throw new BadRequestException(
          'Sub category does not belong to category',
        );
      }
      transaction.subCategory = subCategory;
      transaction.category = nextCategory;
    } else if (dto.subCategoryId === null) {
      transaction.subCategory = null;
    }
    transaction.amount = dto.amount ?? transaction.amount;
    transaction.type = dto.type ?? transaction.type;
    transaction.note = dto.note ?? transaction.note;
    transaction.pictureURL = dto.pictureURL ?? transaction.pictureURL;
    if (dto.transactionDate) {
      const parsedDate = new Date(dto.transactionDate);
      if (!isNaN(parsedDate.getTime())) {
        transaction.transaction_date = parsedDate;
      }
    }

    const oldAmount = Number(transaction.amount);
    const newAmount = dto.amount !== undefined ? Number(dto.amount) : oldAmount;
    const oldType = transaction.type;
    const newType = dto.type ?? oldType;
    const oldWalletId = transaction.wallet?.id;
    const newWalletId = dto.walletId !== undefined ? dto.walletId : oldWalletId;

    if (oldWalletId || newWalletId) {
      if (oldWalletId === newWalletId) {
        if (oldWalletId) {
          const wallet = await this.walletRepo.findOne({
            where: { id: oldWalletId },
          });
          if (wallet) {
            wallet.balance =
              oldType === 'income'
                ? Number(wallet.balance) - oldAmount
                : Number(wallet.balance) + oldAmount;
            wallet.balance =
              newType === 'income'
                ? Number(wallet.balance) + newAmount
                : Number(wallet.balance) - newAmount;
            await this.walletRepo.save(wallet);
          }
        }
      } else {
        if (oldWalletId) {
          const oldWallet = await this.walletRepo.findOne({
            where: { id: oldWalletId },
          });
          if (oldWallet) {
            oldWallet.balance =
              oldType === 'income'
                ? Number(oldWallet.balance) - oldAmount
                : Number(oldWallet.balance) + oldAmount;
            await this.walletRepo.save(oldWallet);
          }
        }
        if (newWalletId) {
          const newWallet = await this.walletRepo.findOne({
            where: { id: newWalletId },
          });
          if (newWallet) {
            newWallet.balance =
              newType === 'income'
                ? Number(newWallet.balance) + newAmount
                : Number(newWallet.balance) - newAmount;
            await this.walletRepo.save(newWallet);
          }
        }
      }
    }

    if (dto.walletId !== undefined) {
      transaction.wallet = dto.walletId ? ({ id: dto.walletId } as any) : null;
    }
    transaction.amount = newAmount;
    transaction.type = newType;

    await this.transactionRepo.save(transaction);

    let newGoalIds: number[] = [];
    if (transaction.wallet) {
      const newGoals = await this.goalRepo.find({
        where: { wallet: { id: transaction.wallet.id } },
      });
      newGoalIds = newGoals.map((g) => g.id);
    }

    await this.financialCacheInvalidationService.invalidate(
      transaction.user.id,
      [...oldGoalIds, ...newGoalIds],
    );

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: transaction,
    });
  }

  async findAllByFilter(
    filter: TransactionFilterDto,
  ): Promise<ApiResponse<{ income: Transaction[]; expense: Transaction[] }>> {
    const {
      userId,
      categoryId,
      subCategoryId,
      walletId,
      startDate,
      endDate,
      categoryName,
      limit,
      includeTransfer,
    } = filter;

    const excludeTransfer = includeTransfer !== 'true';

    const incomeQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      userId,
      'income',
      {
        categoryId,
        subCategoryId,
        walletId,
        startDate,
        endDate,
        withRelations: true,
        categoryName,
        excludeTransfer,
      },
    );

    const expenseQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      userId,
      'expense',
      {
        categoryId,
        subCategoryId,
        walletId,
        startDate,
        endDate,
        withRelations: true,
        categoryName,
        excludeTransfer,
      },
    );

    incomeQuery.orderBy('transaction.transaction_date', 'DESC');
    expenseQuery.orderBy('transaction.transaction_date', 'DESC');

    if (limit) {
      incomeQuery.take(limit);
      expenseQuery.take(limit);
    }

    const [income, expense] = await Promise.all([
      incomeQuery.getMany(),
      expenseQuery.getMany(),
    ]);

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: { income, expense },
    });
  }

  async remove(id: number): Promise<ApiResponse<string>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'user', 'wallet'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (transaction.wallet) {
      const wallet = await this.walletRepo.findOne({
        where: { id: transaction.wallet.id },
      });
      if (wallet) {
        const amt = Number(transaction.amount);
        wallet.balance =
          transaction.type === 'income'
            ? Number(wallet.balance) - amt
            : Number(wallet.balance) + amt;
        await this.walletRepo.save(wallet);
      }
    }

    await this.transactionRepo.remove(transaction);
    let affectedGoalIds: number[] = [];
    if (transaction.wallet) {
      const goals = await this.goalRepo.find({
        where: { wallet: { id: transaction.wallet.id } },
      });
      affectedGoalIds = goals.map((g) => g.id);
    }
    await this.financialCacheInvalidationService.invalidate(
      transaction.user.id,
      affectedGoalIds,
    );
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }

}
