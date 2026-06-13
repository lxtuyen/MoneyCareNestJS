import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { CoupleMember } from './entities/couple-member.entity';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { ok } from 'src/common/utils/response.util';

@Injectable()
export class CoupleSettlementService {
  constructor(
    @InjectRepository(CoupleMember)
    private readonly coupleMemberRepo: Repository<CoupleMember>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
  ) {}

  private async checkMembership(
    userId: number,
    coupleId: number,
  ): Promise<void> {
    const membership = await this.coupleMemberRepo.findOne({
      where: { userId, coupleId },
    });
    if (!membership) {
      throw new ForbiddenException('Bạn không thuộc không gian cặp đôi này.');
    }
  }

  private getUserDisplayName(user?: User | null): string {
    if (!user) return 'Thành viên';
    const profile = user.profile;
    const fullName = [profile?.first_name, profile?.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || user.email || `User ${user.id}`;
  }

  async getSettlementSummary(
    coupleId: number,
    requestUserId: number,
  ): Promise<ApiResponse<any>> {
    await this.checkMembership(requestUserId, coupleId);

    const members = await this.coupleMemberRepo.find({
      where: { coupleId },
      relations: ['user', 'user.profile'],
    });

    if (members.length < 2) {
      return ok({
        netBalance: [],
        whoOwesWhom: null,
        unsettledTransactions: [],
      });
    }

    const memberA = members[0].user;
    const memberB = members[1].user;
    const idA = memberA.id;
    const idB = memberB.id;

    const unsettledTransactions = await this.transactionRepo.find({
      where: {
        coupleId,
        settlementStatus: 'unsettled',
        splitMethod: Not('none'),
      },
      relations: [
        'payer',
        'payer.profile',
        'splits',
        'splits.user',
        'splits.user.profile',
        'user',
        'user.profile',
        'category',
      ],
      order: { transaction_date: 'DESC' },
    });

    const paidAmount = { [idA]: 0, [idB]: 0 };
    const owedAmount = { [idA]: 0, [idB]: 0 };

    for (const transaction of unsettledTransactions) {
      const payerId = transaction.payerId ?? transaction.user?.id;
      if (payerId && (payerId === idA || payerId === idB)) {
        paidAmount[payerId] += Number(transaction.amount);
      }

      for (const split of transaction.splits) {
        const splitUserId = split.userId;
        if (splitUserId === idA || splitUserId === idB) {
          owedAmount[splitUserId] += Number(split.amount);
        }
      }
    }

    const roundedNetA =
      Math.round((paidAmount[idA] - owedAmount[idA]) * 100) / 100;
    const roundedNetB =
      Math.round((paidAmount[idB] - owedAmount[idB]) * 100) / 100;

    let whoOwesWhom: any = null;
    if (roundedNetA < 0 && roundedNetB > 0) {
      whoOwesWhom = {
        debtorId: idA,
        debtorName: this.getUserDisplayName(memberA),
        creditorId: idB,
        creditorName: this.getUserDisplayName(memberB),
        amount: Math.abs(roundedNetA),
      };
    } else if (roundedNetB < 0 && roundedNetA > 0) {
      whoOwesWhom = {
        debtorId: idB,
        debtorName: this.getUserDisplayName(memberB),
        creditorId: idA,
        creditorName: this.getUserDisplayName(memberA),
        amount: Math.abs(roundedNetB),
      };
    }

    const mappedTransactions = unsettledTransactions.map((transaction) => {
      const creator = transaction.user;
      const payer = transaction.payer;
      return {
        id: transaction.id,
        amount: Number(transaction.amount),
        type: transaction.type,
        note: transaction.note,
        transaction_date: transaction.transaction_date,
        category: transaction.category,
        payerId: transaction.payerId ?? creator?.id,
        payerName: this.getUserDisplayName(payer ?? creator),
        splitMethod: transaction.splitMethod,
        splits: transaction.splits.map((split) => ({
          userId: split.userId,
          amount: Number(split.amount),
          percent: split.percent !== null ? Number(split.percent) : null,
          userName: this.getUserDisplayName(split.user),
        })),
      };
    });

    return ok({
      netBalance: [
        {
          userId: idA,
          userName: this.getUserDisplayName(memberA),
          netAmount: roundedNetA,
        },
        {
          userId: idB,
          userName: this.getUserDisplayName(memberB),
          netAmount: roundedNetB,
        },
      ],
      whoOwesWhom,
      unsettledTransactions: mappedTransactions,
    });
  }

  async settleUp(
    coupleId: number,
    requestUserId: number,
  ): Promise<ApiResponse<string>> {
    await this.checkMembership(requestUserId, coupleId);

    const unsettledTransactions = await this.transactionRepo.find({
      where: {
        coupleId,
        settlementStatus: 'unsettled',
        splitMethod: Not('none'),
      },
    });

    if (unsettledTransactions.length === 0) {
      return ok('Không có giao dịch nào cần quyết toán.');
    }

    const now = new Date();
    for (const transaction of unsettledTransactions) {
      transaction.settlementStatus = 'settled';
      transaction.settledAt = now;
      transaction.settledById = requestUserId;
    }

    await this.transactionRepo.save(unsettledTransactions);
    return ok('Đã quyết toán tất cả giao dịch thành công.');
  }

  async settleUpSingle(
    coupleId: number,
    transactionId: number,
    requestUserId: number,
  ): Promise<ApiResponse<string>> {
    await this.checkMembership(requestUserId, coupleId);

    const transaction = await this.transactionRepo.findOne({
      where: {
        id: transactionId,
        coupleId,
        settlementStatus: 'unsettled',
        splitMethod: Not('none'),
      },
    });

    if (!transaction) {
      throw new ForbiddenException(
        'Giao dịch không tồn tại hoặc đã được quyết toán.',
      );
    }

    const now = new Date();
    transaction.settlementStatus = 'settled';
    transaction.settledAt = now;
    transaction.settledById = requestUserId;

    await this.transactionRepo.save(transaction);
    return ok('Đã quyết toán giao dịch thành công.');
  }
}
