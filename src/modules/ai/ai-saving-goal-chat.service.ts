/* eslint-disable no-irregular-whitespace */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ok } from 'src/common/utils/response.util';
import { formatVnd } from 'src/common/utils/money.util';
import { norm } from 'src/common/utils/string.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoalsService } from 'src/modules/saving-goals/saving-goals.service';
import { WalletsService } from 'src/modules/wallets/wallets.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import {
  getProposeSavingGoalPrompt,
  getProposeSavingGoalTool,
  GeminiResponse,
} from './config/gemini-tools.config';
import { AiMessagePrefix } from './types/ai.types';
import {
  buildDurationOptions,
  buildSavingGoalDurationMessage,
  buildSavingGoalRecommendation,
} from './helpers/saving-goal-proposal.helper';

type ConfirmSavingGoalPayload = {
  name?: string;
  target: number;
  months: number;
  initFund?: number;
  sourceWalletId?: number;
};

type InitFundPayload = {
  name?: string;
  target: number;
  initFund?: number;
  sourceWalletId?: number;
  requestedMonths?: number;
};

type ChangeDurationPayload = {
  name?: string;
  target: number;
  months: number;
};

@Injectable()
export class AiSavingGoalChatService {
  private readonly logger = new Logger(AiSavingGoalChatService.name);

  constructor(
    private readonly spendingPlansService: SpendingPlansService,
    private readonly savingGoalsService: SavingGoalsService,
    private readonly walletsService: WalletsService,
    private readonly geminiClient: AiGeminiClientService,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  isSavingGoalRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const savingKeywords = [
      'tiet kiem',
      'gom tien',
      'muc tieu',
      'muon mua',
      'de danh',
      'gop tien',
      'saving',
      'goal',
    ];

    const hasAmount =
      /\d/.test(normalized) ||
      /\b(k|nghin|ngan|tr|trieu|cu|dong|vnd)\b/.test(normalized);

    return savingKeywords.some((kw) => normalized.includes(kw)) && hasAmount;
  }

  private parseCommandPayload<T>(message: string, command: string): T {
    const payloadStr = message.replace(command, '').trim();
    return JSON.parse(payloadStr) as T;
  }

  async handleSavingGoalRequest(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);

      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;

      const nowIso = new Date().toISOString();
      const prompt = getProposeSavingGoalPrompt(message, nowIso, capacity);
      const toolConfig = getProposeSavingGoalTool();

      const response = await this.geminiClient.generateToolContent(
        prompt,
        toolConfig,
      );

      const calls = (response as unknown as GeminiResponse).functionCalls;
      const args = calls?.[0]?.args as Record<
        string,
        string | number | boolean | null | undefined
      >;
      if (!args) {
        return ok(
          '',
          'Tôi chưa hiểu rõ mục tiêu tiết kiệm của bạn. Bạn có thể nói rõ hơn không? Ví dụ: "Tôi muón tiết kiệm 3 triệu mua điện thoại".',
        );
      }

      const name = args.name || 'Mục tiêu tiết kiệm';
      const target = Number(args.target) || 0;
      const requestedMonths = Number(args.requested_months) || 0;

      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
        relations: ['savingGoals'],
      });
      const positiveWallets = activeWallets.filter(
        (w) => w.savingGoals.length === 0 && Number(w.balance) > 0,
      );

      if (positiveWallets.length > 0 && target > 0) {
        const totalPositiveBalance = positiveWallets.reduce(
          (sum, w) => sum + Number(w.balance),
          0,
        );
        let suggestedWallet = positiveWallets[0];
        for (const w of positiveWallets) {
          if (Number(w.balance) > Number(suggestedWallet.balance)) {
            suggestedWallet = w;
          }
        }

        const walletsData = positiveWallets.map((w) => ({
          id: w.id,
          name: w.name,
          balance: Number(w.balance),
        }));

        return ok(
          '',
          `${AiMessagePrefix.SAVING_GOAL_INITIAL_FUND_ASK}${JSON.stringify({
            name,
            target,
            wallets: walletsData,
            totalBalance: totalPositiveBalance,
            suggestedWalletId: suggestedWallet.id,
            requestedMonths,
          })}`,
        );
      }

      const hasRequestedMonths = requestedMonths > 0;
      let monthsEstimate = Number(args.months_estimate) || 6;
      let aiMessage = '';
      let suggestedMonthlySaving = Math.round(target / monthsEstimate);
      let maxMonthlySaving = plannedSavingCapacity;
      let isWarning = false;

      if (hasRequestedMonths) {
        monthsEstimate = Math.max(1, Math.round(requestedMonths));
        const durationMessage = buildSavingGoalDurationMessage({
          name: String(name),
          target,
          amountToSave: target,
          months: monthsEstimate,
          capacity,
          plannedSavingCapacity,
          mode: 'new_goal',
        });
        suggestedMonthlySaving = durationMessage.requiredPerMonth;
        maxMonthlySaving = durationMessage.maxMonthlySaving;
        isWarning = durationMessage.isWarning;
        aiMessage = durationMessage.aiMessage;
      } else if (capacity && plannedSavingCapacity > 0) {
        const recommendation = buildSavingGoalRecommendation(
          target,
          plannedSavingCapacity,
        );
        monthsEstimate = recommendation.months;
        suggestedMonthlySaving = recommendation.suggestedMonthlySaving;
        maxMonthlySaving = recommendation.maxMonthlySaving;

        aiMessage = `Vậy khả năng tiết kiệm hiện tại là "${formatVnd(recommendation.maxMonthlySaving)}/tháng", nếu dùng hết số dư bạn sẽ cần khoảng "${recommendation.rawDurationText}" để tích lũy đủ "${formatVnd(target)}" cho mục tiêu "${name}".\n\n💡 Để kế hoạch dễ theo dõi và không dùng hết toàn bộ số dư mỗi tháng, tôi đề xuất mốc "${recommendation.months} tháng", tương đương khoảng "${formatVnd(recommendation.suggestedMonthlySaving)}/tháng". Bạn vẫn có thể đổi thời gian nếu muốn hoàn thành nhanh hơn hoặc thoải mái hơn.`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(target / 6);
        aiMessage = `Tôi đã ghi nhận đề xuất tích lũy "${formatVnd(target)}" cho mục tiêu "${name}". Vì kế hoạch chi tiêu hiện tại của bạn chưa có thặng dư để tích lũy (khả năng tiết kiệm hiện tại là 0đ/tháng), tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(suggestedMonthlySaving)}/tháng"). Bạn hãy điều chỉnh kế hoạch chi tiêu hoặc cắt giảm chi phí để gia tăng khả năng tiết kiệm nhé!`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(target / 6);
        aiMessage = `Tôi đã ghi nhận đề xuất tích lũy "${formatVnd(target)}" cho mục tiêu "${name}". Vì bạn chưa thiết lập Kế hoạch chi tiêu, tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(Math.round(target / 6))}/tháng"). Bạn hãy lập Kế hoạch chi tiêu để theo dõi chính xác hơn nhé!`;
      }

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + monthsEstimate);
      const durationOptions = hasRequestedMonths
        ? []
        : buildDurationOptions(target, monthsEstimate);

      return ok(
        '',
        `${AiMessagePrefix.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target,
          monthsEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving,
          maxMonthlySaving,
          durationOptions,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          isRequestedDuration: hasRequestedMonths,
          aiMessage,
        })}`,
      );
    } catch (error) {
      this.logger.error('handleSavingGoalRequest failed', error);
      return ok(
        '',
        'Tôi gặp lỗi khi đề xuất mục tiêu tiết kiệm. Bạn vui lòng thử lại nhé!',
      );
    }
  }

  async handleConfirmSavingGoal(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const payload = this.parseCommandPayload<ConfirmSavingGoalPayload>(
        message,
        '/confirm_saving_goal',
      );

      const { name, target, months, initFund, sourceWalletId } = payload;
      const monthsEstimate = Number(months) || 6;
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + monthsEstimate);

      const createResult = await this.savingGoalsService.create(
        {
          name: name || 'Mục tiêu tiết kiệm',
          target: Number(target) || 0,
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          create_new_wallet: true,
        },
        userId,
      );

      const createdGoal = createResult.data;
      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;
      const suggestedMonthlySaving = Math.round(
        Number(target) / monthsEstimate,
      );

      const user = await this.userRepo.findOne({ where: { id: userId } });
      const activeInitFund = Number(initFund) || 0;
      const activeSourceWalletId = Number(sourceWalletId) || 0;

      let transferSuccess = false;
      let sourceWalletName = '';

      if (
        activeInitFund > 0 &&
        activeSourceWalletId > 0 &&
        createdGoal?.wallet?.id &&
        user
      ) {
        try {
          const sourceWallet = await this.walletRepo.findOne({
            where: { id: activeSourceWalletId },
          });
          if (sourceWallet) {
            sourceWalletName = sourceWallet.name;
            await this.walletsService.transfer(
              {
                fromWalletId: activeSourceWalletId,
                toWalletId: createdGoal.wallet.id,
                amount: activeInitFund,
                note: `Tích lũy ban đầu cho mục tiêu: ${name}`,
              },
              user,
            );
            transferSuccess = true;
          }
        } catch (transferError) {
          this.logger.error(
            'Failed to transfer initial fund during confirm saving goal',
            transferError,
          );
        }
      }

      let aiMessage = `Tuyệt vời! Tôi đã tạo thành công mục tiêu "${name}" với số tiền cần tích lũy là "${formatVnd(target)}" trong vòng "${monthsEstimate} tháng". Một ví mục tiêu mới cũng đã được kích hoạt để bạn bắt đầu tích lũy!`;
      if (transferSuccess && activeInitFund > 0) {
        aiMessage = `Tuyệt vời! Tôi đã tạo thành công mục tiêu "${name}" với số tiền cần tích lũy là "${formatVnd(target)}" trong vòng "${monthsEstimate} tháng". Đồng thời, tôi đã tự động trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}" chuyển sang ví tích lũy "${createdGoal?.wallet?.name}" của mục tiêu này làm vốn ban đầu!`;
      }

      return {
        success: true,
        statusCode: 200,
        message: `${AiMessagePrefix.SAVING_GOAL_CREATED}${JSON.stringify({
          goalId: createdGoal?.id,
          name,
          target: Number(target),
          monthsEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving,
          maxMonthlySaving: plannedSavingCapacity,
          hasPlan: !!capacity,
          initFund: activeInitFund,
          sourceWalletId: activeSourceWalletId,
          aiMessage,
        })}`,
      };
    } catch (error) {
      this.logger.error('handleConfirmSavingGoal failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Có lỗi xảy ra khi xác nhận tạo mục tiêu tiết kiệm. Vui lòng thử lại!',
      };
    }
  }

  async handleSavingGoalInitFund(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const payload = this.parseCommandPayload<InitFundPayload>(
        message,
        '/saving_goal_init_fund',
      );

      const { name, target, initFund, sourceWalletId, requestedMonths } =
        payload;
      const activeInitFund = Number(initFund) || 0;
      const activeSourceWalletId = Number(sourceWalletId) || 0;
      const remainingTarget = Math.max(0, Number(target) - activeInitFund);

      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;
      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });
      const sourceWallet = activeWallets.find(
        (w) => w.id === activeSourceWalletId,
      );
      const sourceWalletName = sourceWallet?.name ?? 'ví đã chọn';

      const parsedRequestedMonths = Number(requestedMonths) || 0;
      const hasRequestedMonths = parsedRequestedMonths > 0;
      let monthsEstimate = 6;
      let suggestedMonthlySaving = Math.round(remainingTarget / monthsEstimate);
      let maxMonthlySaving = plannedSavingCapacity;
      let isWarning = false;
      let aiMessage = '';

      if (remainingTarget <= 0) {
        monthsEstimate = 0;
        suggestedMonthlySaving = 0;
        aiMessage = `Tuyệt vời! Bạn trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, đủ để hoàn thành mục tiêu "${name}" trị giá "${formatVnd(target)}" ngay lập tức! Bạn có muốn tiến hành tạo mục tiêu ngay không?`;
      } else if (hasRequestedMonths) {
        monthsEstimate = Math.max(1, Math.round(parsedRequestedMonths));
        const durationMessage = buildSavingGoalDurationMessage({
          name,
          target: Number(target),
          amountToSave: remainingTarget,
          months: monthsEstimate,
          capacity,
          plannedSavingCapacity,
          mode: 'with_init_fund',
          initFund: activeInitFund,
          sourceWalletName,
        });
        suggestedMonthlySaving = durationMessage.requiredPerMonth;
        maxMonthlySaving = durationMessage.maxMonthlySaving;
        isWarning = durationMessage.isWarning;
        aiMessage = durationMessage.aiMessage;
      } else if (capacity && plannedSavingCapacity > 0) {
        const recommendation = buildSavingGoalRecommendation(
          remainingTarget,
          plannedSavingCapacity,
        );
        monthsEstimate = recommendation.months;
        suggestedMonthlySaving = recommendation.suggestedMonthlySaving;
        maxMonthlySaving = recommendation.maxMonthlySaving;

        aiMessage = `Sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, bạn còn thiếu "${formatVnd(remainingTarget)}" cho mục tiêu "${name}".\n\n💡 Để kế hoạch thoải mái, tôi đề xuất mốc "${recommendation.months} tháng", tương đương khoảng "${formatVnd(recommendation.suggestedMonthlySaving)}/tháng" (nằm trong khả năng tiết kiệm "${formatVnd(plannedSavingCapacity)}/tháng" của bạn).`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(remainingTarget / 6);
        aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" (còn thiếu "${formatVnd(remainingTarget)}" sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Vì kế hoạch chi tiêu hiện tại của bạn chưa có thặng dư để tích lũy (khả năng tiết kiệm hiện tại là 0đ/tháng), tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(suggestedMonthlySaving)}/tháng"). Bạn có thể điều chỉnh kế hoạch chi tiêu để gia tăng tích lũy nhé!`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(remainingTarget / 6);
        aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" (còn thiếu "${formatVnd(remainingTarget)}" sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Vì bạn chưa có Kế hoạch chi tiêu, tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(suggestedMonthlySaving)}/tháng").`;
      }

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + (monthsEstimate || 1));
      const durationOptions =
        hasRequestedMonths || remainingTarget <= 0
          ? []
          : buildDurationOptions(remainingTarget, monthsEstimate);

      return {
        success: true,
        statusCode: 200,
        message: `${AiMessagePrefix.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target: Number(target),
          initFund: activeInitFund,
          sourceWalletId: activeSourceWalletId,
          remainingTarget,
          monthsEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving,
          maxMonthlySaving,
          durationOptions,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          isRequestedDuration: hasRequestedMonths,
          aiMessage,
        })}`,
      };
    } catch (error) {
      this.logger.error('handleSavingGoalInitFund failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Tôi gặp lỗi khi đề xuất lộ trình dựa trên số vốn ban đầu. Vui lòng thử lại!',
      };
    }
  }

  async handleChangeSavingGoalDuration(
    message: string,
    userId: number,
  ): Promise<ApiResponse<string>> {
    try {
      const payload = this.parseCommandPayload<ChangeDurationPayload>(
        message,
        '/change_saving_goal_duration',
      );

      const { name, target, months } = payload;
      const requestedMonths = Math.max(1, Number(months));

      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(0, capacity.totalAmount - capacity.fixedExpenseTotal)
        : 0;
      const requiredPerMonth = Math.round(target / requestedMonths);
      const maxMonthlySaving = plannedSavingCapacity;

      const durationMessage = buildSavingGoalDurationMessage({
        name,
        target,
        amountToSave: target,
        months: requestedMonths,
        capacity,
        plannedSavingCapacity,
        mode: 'change_duration',
      });

      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + requestedMonths);
      const durationOptions = buildDurationOptions(target, requestedMonths);

      return {
        success: true,
        statusCode: 200,
        message: `${AiMessagePrefix.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target,
          monthsEstimate: requestedMonths,
          monthlySavingCapacity: plannedSavingCapacity,
          suggestedMonthlySaving: requiredPerMonth,
          maxMonthlySaving,
          durationOptions,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning: durationMessage.isWarning,
          aiMessage: durationMessage.aiMessage,
          endDate: endDate.toISOString(),
        })}`,
      };
    } catch (error) {
      this.logger.error('handleChangeSavingGoalDuration failed', error);
      return {
        success: true,
        statusCode: 200,
        message:
          'Có lỗi xảy ra khi điều chỉnh thời gian mục tiêu. Vui lòng thử lại!',
      };
    }
  }
}
