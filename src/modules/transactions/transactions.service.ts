import {
  Injectable,
  BadRequestException,
  NotFoundException,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransactionSplit } from './entities/transaction-split.entity';
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
import {
  calculateTransactionSplits,
  SplitMethod,
} from './transaction-split.util';
import { CouplesService } from '../couples/couples.service';
import { Couple } from '../couples/entities/couple.entity';
import { AnalyticsPredictionService } from '../analytics/analytics-prediction.service';
import { SnapshotService } from '../analytics/snapshot.service';

@Injectable()
export class TransactionService {
  constructor(
    @InjectRepository(Transaction)
    private transactionRepo: Repository<Transaction>,
    @InjectRepository(TransactionSplit)
    private splitRepo: Repository<TransactionSplit>,
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
    private couplesService: CouplesService,
    private analyticsPredictionService: AnalyticsPredictionService,
    private snapshotService: SnapshotService,
  ) {}

  private getUserDisplayName(user?: User | null): string | null {
    if (!user) return null;
    const profile = user.profile;
    const fullName = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || user.email || null;
  }

  private mapTransactionResponse(
    transaction: Transaction,
    requestingUserId?: number,
    showFullAmount = false,
  ) {
    const creator = transaction.user;
    const payer = transaction.payer;
    const wallet = transaction.wallet;
    const coupleId = transaction.coupleId ?? transaction.couple?.id ?? null;
    const payerId = transaction.payerId ?? payer?.id ?? null;

    let amount = Number(transaction.amount);
    const fullAmount = amount;

    if (coupleId && requestingUserId && !showFullAmount) {
      if (transaction.splitMethod && transaction.splitMethod !== 'none') {
        if (transaction.splits && transaction.splits.length > 0) {
          const userSplit = transaction.splits.find(
            (s) => s.userId === requestingUserId,
          );
          if (userSplit) {
            amount = Number(userSplit.amount);
          }
        }
      } else {
        if (payerId !== requestingUserId) {
          amount = 0;
        }
      }
    }

    return {
      id: transaction.id,
      amount,
      fullAmount,
      type: transaction.type,
      note: transaction.note,
      pictureURL: transaction.pictureURL,
      transaction_date: transaction.transaction_date?.toISOString(),
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
      category: transaction.category,
      subCategory: transaction.subCategory,
      wallet: wallet
        ? {
            id: wallet.id,
            name: wallet.name,
            balance: wallet.balance,
            coupleId: wallet.coupleId,
          }
        : null,
      couple_id: coupleId,
      coupleId,
      payer_id: payerId,
      payerId,
      payerName: this.getUserDisplayName(payer),
      payer: payer
        ? {
            id: payer.id,
            fullName: this.getUserDisplayName(payer),
          }
        : null,
      creatorId: creator?.id ?? null,
      creatorName: this.getUserDisplayName(creator),
      isTransfer: transaction.isTransfer,
      splitMethod: transaction.splitMethod ?? 'none',
      settlementStatus: transaction.settlementStatus ?? null,
      splits: transaction.splits
        ? transaction.splits.map((s) => ({
            userId: s.userId,
            amount: Number(s.amount),
            percent: s.percent !== null ? Number(s.percent) : null,
          }))
        : [],
    };
  }

  async create(
    dto: CreateTransactionDto,
    requestUserId?: number,
  ): Promise<ApiResponse<any>> {
    if (requestUserId) {
      if (!dto.coupleId && requestUserId !== dto.userId) {
        throw new ForbiddenException(
          'Bạn không thể tạo giao dịch cho tài khoản khác.',
        );
      }
      if (dto.coupleId) {
        dto.userId = requestUserId;
      }
    }

    const [user, requestedCategory, subCategory, wallet] = await Promise.all([
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
      dto.walletId
        ? this.walletRepo.findOne({
            where: { id: dto.walletId },
            relations: ['user'],
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
    if (dto.walletId && !wallet) {
      throw new NotFoundException('Wallet not found');
    }


    const category = requestedCategory ?? subCategory?.category ?? null;
    if (
      requestedCategory &&
      subCategory &&
      subCategory.category?.id !== requestedCategory.id
    ) {
      throw new BadRequestException('Sub category does not belong to category');
    }

    let couple: Couple | null = null;
    let payer: User | null = null;

    if (dto.coupleId) {
      const activeCouple = await this.couplesService.getActiveCoupleForUser(
        dto.userId,
      );
      if (!activeCouple || activeCouple.id !== dto.coupleId) {
        throw new BadRequestException(
          'Bạn không thuộc không gian cặp đôi này hoặc không gian không hoạt động.',
        );
      }
      couple = activeCouple;

      const payerId = dto.payerId ?? dto.userId;
      const payerActiveCouple =
        await this.couplesService.getActiveCoupleForUser(payerId);
      if (!payerActiveCouple || payerActiveCouple.id !== dto.coupleId) {
        throw new BadRequestException(
          'Người thanh toán không thuộc không gian cặp đôi này.',
        );
      }
      payer = await this.userRepo.findOne({ where: { id: payerId } });
      if (!payer) throw new NotFoundException('Payer not found');

      if (wallet && wallet.coupleId !== dto.coupleId) {
        throw new BadRequestException(
          'Ví chọn không khớp với không gian cặp đôi của giao dịch.',
        );
      }
    } else {
      if (wallet && wallet.user && wallet.user.id !== dto.userId) {
        throw new ForbiddenException('Bạn không có quyền sử dụng ví này.');
      }
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
      wallet: wallet ?? null,
      pictureURL: dto.pictureURL,
      couple,
      payer: payer ?? user,
    });

    if (dto.coupleId && dto.splitMethod && dto.splitMethod !== 'none') {
      transaction.splitMethod = dto.splitMethod;
      transaction.settlementStatus = 'unsettled';

      const coupleMembers = await this.couplesService.getCoupleMembers(
        dto.coupleId,
      );
      if (coupleMembers.length < 2) {
        throw new BadRequestException(
          'Không gian cặp đôi chưa đủ thành viên để thực hiện chia tiền.',
        );
      }

      const userIdA = coupleMembers[0].userId;
      const userIdB = coupleMembers[1].userId;
      const totalAmount = Number(dto.amount);
      const splitDetails = calculateTransactionSplits({
        splitMethod: dto.splitMethod as SplitMethod,
        totalAmount,
        memberIds: [userIdA, userIdB],
        splits: dto.splits,
      });
      transaction.splits = splitDetails.map((d) =>
        this.splitRepo.create({
          userId: d.userId,
          amount: d.amount,
          percent: d.percent,
        }),
      );
    }

    if (wallet) {
      const amt = Number(dto.amount);
      wallet.balance =
        dto.type === 'income'
          ? Number(wallet.balance) + amt
          : Number(wallet.balance) - amt;
      await this.walletRepo.save(wallet);
    }

    const savedTransaction = await this.transactionRepo.save(transaction);

    if (dto.coupleId) {
      await this.couplesService.updateStreak(dto.coupleId);
    }

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

    // Invalidate AI prediction cache — kết quả AI cũ không còn chính xác khi có giao dịch mới
    void this.analyticsPredictionService.invalidateUserCache(user.id).catch(() => undefined);

    // Delta update snapshot (bỏ qua transfer)
    if (!transaction.isTransfer && category) {
      const txDate = new Date(transaction.transaction_date);
      void this.snapshotService.applyDelta(
        user.id,
        txDate.getMonth() + 1,
        txDate.getFullYear(),
        {
          incomeChange: dto.type === 'income' ? Number(dto.amount) : 0,
          expenseChange: dto.type === 'expense' ? Number(dto.amount) : 0,
          category: category.name,
          type: dto.type,
          countChange: 1,
        },
      ).catch(() => undefined);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: this.mapTransactionResponse(
        savedTransaction,
        requestUserId,
        !!dto.coupleId,
      ),
    });
  }

  async update(
    id: number,
    dto: UpdateTransactionDto,
    userId?: number,
  ): Promise<ApiResponse<any>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: [
        'category',
        'subCategory',
        'user',
        'user.profile',
        'wallet',
        'payer',
        'payer.profile',
        'couple',
        'splits',
      ],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (userId) {
      if (transaction.coupleId) {
        const activeCouple =
          await this.couplesService.getActiveCoupleForUser(userId);
        if (!activeCouple || activeCouple.id !== transaction.coupleId) {
          throw new ForbiddenException(
            'Bạn không thuộc không gian cặp đôi của giao dịch này.',
          );
        }
      } else if (transaction.user.id !== userId) {
        throw new ForbiddenException(
          'Bạn không có quyền sửa giao dịch của người khác.',
        );
      }
    }

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

    const oldAmount = Number(transaction.amount);
    const oldType = transaction.type;
    const oldWalletId = transaction.wallet?.id;

    if (dto.coupleId) {
      const activeCouple = await this.couplesService.getActiveCoupleForUser(
        userId ?? transaction.user.id,
      );
      if (!activeCouple || activeCouple.id !== dto.coupleId) {
        throw new BadRequestException(
          'Bạn không thuộc không gian cặp đôi này hoặc không gian không hoạt động.',
        );
      }
      transaction.couple = activeCouple;
    } else if (dto.coupleId === null) {
      transaction.couple = null;
    }

    if (dto.payerId) {
      const targetCoupleId =
        dto.coupleId !== undefined ? dto.coupleId : transaction.coupleId;
      if (!targetCoupleId) {
        throw new BadRequestException(
          'Giao dịch cá nhân không thể có người thanh toán khác.',
        );
      }
      const payerActiveCouple =
        await this.couplesService.getActiveCoupleForUser(dto.payerId);
      if (!payerActiveCouple || payerActiveCouple.id !== targetCoupleId) {
        throw new BadRequestException(
          'Người thanh toán không thuộc không gian cặp đôi này.',
        );
      }
      const payerUser = await this.userRepo.findOne({
        where: { id: dto.payerId },
      });
      if (!payerUser) throw new NotFoundException('Payer not found');
      transaction.payer = payerUser;
    } else if (dto.payerId === null) {
      transaction.payer = null;
    }

    const newAmount = dto.amount !== undefined ? Number(dto.amount) : oldAmount;
    const newType = dto.type ?? oldType;
    const newWalletId = dto.walletId !== undefined ? dto.walletId : oldWalletId;



    if (
      newWalletId &&
      (dto.walletId !== undefined || dto.coupleId !== undefined)
    ) {
      const nextWallet = await this.walletRepo.findOne({
        where: { id: newWalletId },
        relations: ['user'],
      });
      if (!nextWallet) throw new NotFoundException('Wallet not found');

      const targetCoupleId =
        dto.coupleId !== undefined ? dto.coupleId : transaction.coupleId;
      if (nextWallet.coupleId && nextWallet.coupleId !== targetCoupleId) {
        throw new BadRequestException(
          'Ví chọn không khớp với không gian cặp đôi của giao dịch.',
        );
      }
      if (
        !targetCoupleId &&
        nextWallet.user &&
        nextWallet.user.id !== transaction.user.id
      ) {
        throw new ForbiddenException('Bạn không có quyền sử dụng ví này.');
      }
    }

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
    transaction.note = dto.note ?? transaction.note;
    transaction.pictureURL = dto.pictureURL ?? transaction.pictureURL;
    if (dto.transactionDate) {
      const parsedDate = new Date(dto.transactionDate);
      if (!isNaN(parsedDate.getTime())) {
        transaction.transaction_date = parsedDate;
      }
    }
    if (
      dto.splitMethod !== undefined ||
      dto.splits !== undefined ||
      dto.amount !== undefined
    ) {
      const targetSplitMethod =
        dto.splitMethod !== undefined
          ? dto.splitMethod
          : transaction.splitMethod;
      const targetAmount =
        dto.amount !== undefined
          ? Number(dto.amount)
          : Number(transaction.amount);
      const targetCoupleId =
        dto.coupleId !== undefined ? dto.coupleId : transaction.coupleId;

      if (targetCoupleId && targetSplitMethod && targetSplitMethod !== 'none') {
        transaction.splitMethod = targetSplitMethod;
        transaction.settlementStatus = 'unsettled';

        const coupleMembers =
          await this.couplesService.getCoupleMembers(targetCoupleId);
        if (coupleMembers.length < 2) {
          throw new BadRequestException(
            'Không gian cặp đôi chưa đủ thành viên để thực hiện chia tiền.',
          );
        }

        const userIdA = coupleMembers[0].userId;
        const userIdB = coupleMembers[1].userId;
        const splitsInput =
          dto.splits ??
          transaction.splits?.map((split) => ({
            userId: split.userId,
            amount: split.amount,
            percent: split.percent ?? undefined,
          }));
        const splitDetails = calculateTransactionSplits({
          splitMethod: targetSplitMethod as SplitMethod,
          totalAmount: targetAmount,
          memberIds: [userIdA, userIdB],
          splits: splitsInput,
        });
        // Delete old splits first
        if (transaction.splits && transaction.splits.length > 0) {
          await this.splitRepo.remove(transaction.splits);
        }

        transaction.splits = splitDetails.map((d) =>
          this.splitRepo.create({
            userId: d.userId,
            amount: d.amount,
            percent: d.percent,
          }),
        );
      } else if (targetSplitMethod === 'none') {
        transaction.splitMethod = 'none';
        transaction.settlementStatus = null;
        if (transaction.splits && transaction.splits.length > 0) {
          await this.splitRepo.remove(transaction.splits);
          transaction.splits = [];
        }
      }
    }

    await this.transactionRepo.save(transaction);
    const savedTransaction =
      (await this.transactionRepo.findOne({
        where: { id: transaction.id },
        relations: [
          'category',
          'subCategory',
          'user',
          'user.profile',
          'wallet',
          'payer',
          'payer.profile',
          'couple',
          'splits',
        ],
      })) ?? transaction;

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

    // Invalidate AI prediction cache
    void this.analyticsPredictionService.invalidateUserCache(transaction.user.id).catch(() => undefined);

    // Delta update snapshot (reverse old + apply new)
    if (!transaction.isTransfer) {
      const oldDate = new Date(transaction.transaction_date);
      const oldCatName = transaction.category?.name || 'Khác';
      const newCatName = savedTransaction.category?.name || oldCatName;
      const newDate = savedTransaction.transaction_date ? new Date(savedTransaction.transaction_date) : oldDate;

      // Reverse old
      void this.snapshotService.applyDelta(
        transaction.user.id,
        oldDate.getMonth() + 1,
        oldDate.getFullYear(),
        {
          incomeChange: oldType === 'income' ? -oldAmount : 0,
          expenseChange: oldType === 'expense' ? -oldAmount : 0,
          category: oldCatName,
          type: oldType,
          countChange: -1,
        },
      ).catch(() => undefined);

      // Apply new
      void this.snapshotService.applyDelta(
        transaction.user.id,
        newDate.getMonth() + 1,
        newDate.getFullYear(),
        {
          incomeChange: newType === 'income' ? newAmount : 0,
          expenseChange: newType === 'expense' ? newAmount : 0,
          category: newCatName,
          type: newType,
          countChange: 1,
        },
      ).catch(() => undefined);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: this.mapTransactionResponse(
        savedTransaction,
        userId,
        !!savedTransaction.coupleId,
      ),
    });
  }

  async findAllByFilter(
    filter: TransactionFilterDto,
    requestingUserId?: number,
  ): Promise<ApiResponse<{ income: any[]; expense: any[] }>> {
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
      coupleId,
    } = filter;

    if (coupleId && requestingUserId) {
      const activeCouple =
        await this.couplesService.getActiveCoupleForUser(requestingUserId);
      if (!activeCouple || activeCouple.id !== coupleId) {
        throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
      }
    }

    const excludeTransfer = includeTransfer !== 'true';

    const incomeQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      userId || requestingUserId || 0,
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
        coupleId,
      },
    );

    const expenseQuery = buildTransactionBaseQuery(
      this.transactionRepo,
      userId || requestingUserId || 0,
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
        coupleId,
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

    const isCoupleSpaceQuery = !!coupleId;
    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: {
        income: income.map((transaction) =>
          this.mapTransactionResponse(
            transaction,
            requestingUserId,
            isCoupleSpaceQuery,
          ),
        ),
        expense: expense.map((transaction) =>
          this.mapTransactionResponse(
            transaction,
            requestingUserId,
            isCoupleSpaceQuery,
          ),
        ),
      },
    });
  }

  async remove(id: number, userId?: number): Promise<ApiResponse<string>> {
    const transaction = await this.transactionRepo.findOne({
      where: { id },
      relations: ['category', 'user', 'wallet'],
    });
    if (!transaction) throw new NotFoundException('Transaction not found');

    if (userId) {
      if (transaction.coupleId) {
        const activeCouple =
          await this.couplesService.getActiveCoupleForUser(userId);
        if (!activeCouple || activeCouple.id !== transaction.coupleId) {
          throw new ForbiddenException(
            'Bạn không thuộc không gian cặp đôi của giao dịch này.',
          );
        }
      } else if (transaction.user.id !== userId) {
        throw new ForbiddenException(
          'Bạn không có quyền xóa giao dịch của người khác.',
        );
      }
    }

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

    // Invalidate AI prediction cache
    void this.analyticsPredictionService.invalidateUserCache(transaction.user.id).catch(() => undefined);

    // Delta update snapshot (reverse deleted transaction)
    if (!transaction.isTransfer && transaction.category) {
      const txDate = new Date(transaction.transaction_date);
      void this.snapshotService.applyDelta(
        transaction.user.id,
        txDate.getMonth() + 1,
        txDate.getFullYear(),
        {
          incomeChange: transaction.type === 'income' ? -Number(transaction.amount) : 0,
          expenseChange: transaction.type === 'expense' ? -Number(transaction.amount) : 0,
          category: transaction.category.name,
          type: transaction.type,
          countChange: -1,
        },
      ).catch(() => undefined);
    }

    return new ApiResponse({
      success: true,
      statusCode: HttpStatus.OK,
      data: 'Deleted successfully',
    });
  }
}
