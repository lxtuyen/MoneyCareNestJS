/* eslint-disable no-irregular-whitespace */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ok } from 'src/common/utils/response.util';
import { formatVnd, roundVndUp } from 'src/common/utils/money.util';
import { norm } from 'src/common/utils/string.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { User } from 'src/modules/user/entities/user.entity';
import {
  Category,
  CategoryType,
} from 'src/modules/categories/entities/category.entity';
import { UserCategoryPreference } from 'src/modules/categories/entities/user-category-preference.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoalsService } from 'src/modules/saving-goals/saving-goals.service';
import { WalletsService } from 'src/modules/wallets/wallets.service';
import { SpendingPlanExpenseFrequency } from 'src/modules/spending-plans/interfaces/spending-plan.enums';
import { AiGeminiClientService } from './ai-gemini-client.service';
import {
  getProposeSavingGoalPrompt,
  getProposeSavingGoalTool,
  GeminiResponse,
} from './config/gemini-tools.config';
import { AiMessagePrefix } from './types/ai.types';
import {
  buildDailyDurationOptions,
  buildSavingGoalDurationMessage,
  buildSavingGoalRecommendation,
  formatDurationFromDays,
} from './helpers/saving-goal-proposal.helper';

type ConfirmSavingGoalPayload = {
  name?: string;
  target: number;
  months: number;
  days?: number;
  initFund?: number;
  sourceWalletId?: number;
  totalAmount?: number;
  budgetItems?: SavingGoalBudgetItemPayload[];
  preserveCurrentBudget?: boolean;
};

type InitFundPayload = {
  name?: string;
  target: number;
  initFund?: number;
  sourceWalletId?: number;
  requestedMonths?: number;
  requestedDays?: number;
};

type ChangeDurationPayload = {
  name?: string;
  target: number;
  months?: number;
  days?: number;
  initFund?: number;
  sourceWalletId?: number;
  preserveCurrentBudget?: boolean;
};

type SavingGoalBudgetItemPayload = {
  categoryId?: number;
  categoryName?: string;
  amount: number;
  monthlyLimit?: number;
  frequencyType?: SpendingPlanExpenseFrequency;
  frequencyValue?: number;
};

type SavingGoalBudgetPlanProposal = {
  totalAmount: number;
  budgetItems: SavingGoalBudgetItemPayload[];
  isCapped?: boolean;
};

type SavingCapacityContext = {
  totalAmount: number;
  fixedExpenseTotal: number;
  monthlySavingCapacity?: number;
  dailySavingCapacity?: number;
  availableSpendingAmount?: number;
  daysInMonth?: number;
  currentDay?: number;
  daysLeft?: number;
  estimatedExpenses?: SavingGoalBudgetItemPayload[];
} | null;

const BUDGET_TEMPLATE: Array<{ name: string; weight: number }> = [
  { name: 'Chợ, siêu thị', weight: 0.2 },
  { name: 'Ăn uống', weight: 0.16 },
  { name: 'Di chuyển', weight: 0.12 },
  { name: 'Hóa đơn', weight: 0.14 },
  { name: 'Nhà cửa', weight: 0.14 },
  { name: 'Sức khỏe', weight: 0.08 },
  { name: 'Mua sắm', weight: 0.07 },
  { name: 'Giải trí', weight: 0.05 },
  { name: 'Chi phí phát sinh', weight: 0.04 },
];

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
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(UserCategoryPreference)
    private readonly userCategoryPreferenceRepo: Repository<UserCategoryPreference>,
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
        ? Math.max(
            0,
            capacity.monthlySavingCapacity ??
              capacity.totalAmount - capacity.fixedExpenseTotal,
          )
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
      const requestedDays = Number(args.requested_days) || 0;

      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
        relations: ['savingGoals'],
      });
      const positiveWallets = activeWallets.filter(
        (w) => (w.savingGoals?.length ?? 0) === 0 && Number(w.balance) > 0,
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
            requestedDays,
          })}`,
        );
      }

      const hasRequestedMonths = requestedMonths > 0;
      const hasRequestedDays = requestedDays > 0;
      const hasRequestedDuration = hasRequestedMonths || hasRequestedDays;
      let monthsEstimate = Number(args.months_estimate) || 6;
      let daysEstimate = monthsEstimate * (capacity?.daysInMonth ?? 30);
      let aiMessage = '';
      let suggestedMonthlySaving = roundVndUp(target / monthsEstimate);
      let suggestedDailySaving = roundVndUp(
        suggestedMonthlySaving / (capacity?.daysInMonth ?? 30),
      );
      let suggestedDailySpending = this.buildDailySpendingLimit(
        capacity,
        suggestedMonthlySaving,
      );
      let maxMonthlySaving = plannedSavingCapacity;
      let isWarning = false;

      if (hasRequestedDays) {
        daysEstimate = Math.max(1, Math.round(requestedDays));
        monthsEstimate = Math.max(1, Math.ceil(daysEstimate / (capacity?.daysInMonth ?? 30)));
        const durationMessage = buildSavingGoalDurationMessage({
          name: String(name),
          target,
          amountToSave: target,
          months: daysEstimate / (capacity?.daysInMonth ?? 30),
          days: daysEstimate,
          capacity,
          plannedSavingCapacity,
          mode: 'new_goal',
        });
        suggestedMonthlySaving = durationMessage.requiredPerMonth;
        suggestedDailySaving = roundVndUp(target / daysEstimate);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        maxMonthlySaving = durationMessage.maxMonthlySaving;
        isWarning = durationMessage.isWarning;
        aiMessage = durationMessage.aiMessage;
      } else if (hasRequestedMonths) {
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
        daysEstimate = monthsEstimate * (capacity?.daysInMonth ?? 30);
        suggestedDailySaving = roundVndUp(
          suggestedMonthlySaving / (capacity?.daysInMonth ?? 30),
        );
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        maxMonthlySaving = durationMessage.maxMonthlySaving;
        isWarning = durationMessage.isWarning;
        aiMessage = durationMessage.aiMessage;
      } else if (capacity && plannedSavingCapacity > 0) {
        const recommendation = buildSavingGoalRecommendation(
          target,
          plannedSavingCapacity,
          capacity.daysInMonth ?? 30,
        );
        monthsEstimate = recommendation.months;
        daysEstimate = recommendation.daysEstimate;
        suggestedMonthlySaving = recommendation.suggestedMonthlySaving;
        suggestedDailySaving = recommendation.suggestedDailySaving;
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        maxMonthlySaving = recommendation.maxMonthlySaving;
        aiMessage = `Với số dư hiện tại "${formatVnd(recommendation.maxMonthlySaving)}/tháng", bạn cần khoảng "${recommendation.rawDurationText}" để tích lũy đủ "${formatVnd(target)}" cho mục tiêu "${name}". Bạn cần giữ mức chi tiêu trung bình khoảng "${formatVnd(suggestedDailySpending)}/ngày".`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = roundVndUp(target / 6);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        aiMessage = `Tôi đã ghi nhận đề xuất tích lũy "${formatVnd(target)}" cho mục tiêu "${name}". Vì kế hoạch chi tiêu hiện tại của bạn chưa có thặng dư để tích lũy (khả năng tiết kiệm hiện tại là 0đ/tháng), tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(suggestedMonthlySaving)}/tháng"). Bạn có thể điều chỉnh kế hoạch chi tiêu hoặc tăng nguồn tích lũy để dễ theo hơn.`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = roundVndUp(target / 6);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        aiMessage = `Tôi đã ghi nhận đề xuất tích lũy "${formatVnd(target)}" cho mục tiêu "${name}". Vì bạn chưa thiết lập Kế hoạch chi tiêu, tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(roundVndUp(target / 6))}/tháng"). Bạn hãy lập Kế hoạch chi tiêu để theo dõi chính xác hơn nhé!`;
      }

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + Math.max(1, daysEstimate));
      const durationOptions = hasRequestedDuration
        ? []
        : buildDailyDurationOptions(
            target,
            daysEstimate,
            capacity?.daysInMonth ?? 30,
          );
      const preserveCurrentBudget =
        !hasRequestedDuration &&
        !!capacity &&
        plannedSavingCapacity > 0 &&
        (capacity.estimatedExpenses?.length ?? 0) > 0;
      const shouldSkipBudgetProposal =
        preserveCurrentBudget ||
        (hasRequestedDuration &&
          !!capacity &&
          (capacity.estimatedExpenses?.length ?? 0) > 0);
      const budgetPlan = shouldSkipBudgetProposal
        ? {
            totalAmount: Math.max(0, Math.round(capacity?.totalAmount ?? 0)),
            budgetItems: [],
          }
        : await this.buildBudgetPlanProposal(
            userId,
            capacity,
            suggestedMonthlySaving,
          );
      if (!hasRequestedDuration && capacity && plannedSavingCapacity > 0) {
        aiMessage = `Với số dư hiện tại "${formatVnd(maxMonthlySaving)}/tháng", bạn cần khoảng "${formatDurationFromDays(daysEstimate)}" để tích lũy đủ "${formatVnd(target)}" cho mục tiêu "${name}". Bạn cần giữ mức chi tiêu trung bình khoảng "${formatVnd(suggestedDailySpending)}/ngày".`;
      }

      return ok(
        '',
        `${AiMessagePrefix.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target,
          monthsEstimate,
          daysEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          dailySavingCapacity: capacity?.dailySavingCapacity ?? 0,
          totalAmount: budgetPlan.totalAmount,
          suggestedMonthlySaving,
          suggestedDailySaving,
          suggestedDailySpending,
          maxMonthlySaving,
          durationOptions,
          budgetItems: budgetPlan.budgetItems,
          preserveCurrentBudget,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          isRequestedDuration: hasRequestedDuration,
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

      const {
        name,
        target,
        months,
        days,
        initFund,
        sourceWalletId,
        preserveCurrentBudget = false,
      } = payload;
      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const daysInMonth = capacity?.daysInMonth ?? 30;
      const activeDays = Math.max(0, Math.round(Number(days) || 0));
      const monthsEstimate = activeDays
        ? Math.max(1, Math.ceil(activeDays / daysInMonth))
        : Number(months) || 6;
      const endDate = new Date();
      if (activeDays) {
        endDate.setDate(endDate.getDate() + activeDays);
      } else {
        endDate.setMonth(endDate.getMonth() + monthsEstimate);
      }

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
      const plannedSavingCapacity = capacity
        ? Math.max(
            0,
            capacity.monthlySavingCapacity ??
              capacity.totalAmount - capacity.fixedExpenseTotal,
          )
        : 0;
      const suggestedMonthlySaving = activeDays
        ? roundVndUp(Number(target) / (activeDays / daysInMonth))
        : roundVndUp(Number(target) / monthsEstimate);

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

      const spendingPlanResult = preserveCurrentBudget
        ? { created: false, planId: undefined }
        : await this.createAndActivateSuggestedPlan(
            userId,
            payload,
            suggestedMonthlySaving,
          );
      if (spendingPlanResult.created) {
        aiMessage +=
          ' Tôi cũng đã tạo và kích hoạt kế hoạch chi tiêu mới theo ngân sách đề xuất.';
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
          spendingPlanId: spendingPlanResult.planId,
          preserveCurrentBudget,
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

      const { name, target, initFund, sourceWalletId, requestedMonths, requestedDays } =
        payload;
      const activeInitFund = Number(initFund) || 0;
      const activeSourceWalletId = Number(sourceWalletId) || 0;
      const remainingTarget = Math.max(0, Number(target) - activeInitFund);

      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(
            0,
            capacity.monthlySavingCapacity ??
              capacity.totalAmount - capacity.fixedExpenseTotal,
          )
        : 0;
      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });
      const sourceWallet = activeWallets.find(
        (w) => w.id === activeSourceWalletId,
      );
      const sourceWalletName = sourceWallet?.name ?? 'ví đã chọn';

      const parsedRequestedMonths = Number(requestedMonths) || 0;
      const parsedRequestedDays = Number(requestedDays) || 0;
      const hasRequestedMonths = parsedRequestedMonths > 0;
      const hasRequestedDays = parsedRequestedDays > 0;
      const hasRequestedDuration = hasRequestedMonths || hasRequestedDays;
      const daysInMonth = capacity?.daysInMonth ?? 30;
      let monthsEstimate = 6;
      let daysEstimate = monthsEstimate * daysInMonth;
      let suggestedMonthlySaving = roundVndUp(remainingTarget / monthsEstimate);
      let suggestedDailySaving = roundVndUp(
        suggestedMonthlySaving / daysInMonth,
      );
      let suggestedDailySpending = this.buildDailySpendingLimit(
        capacity,
        suggestedMonthlySaving,
      );
      let maxMonthlySaving = plannedSavingCapacity;
      let isWarning = false;
      let aiMessage = '';

      if (remainingTarget <= 0) {
        monthsEstimate = 0;
        daysEstimate = 0;
        suggestedMonthlySaving = 0;
        suggestedDailySaving = 0;
        suggestedDailySpending = this.buildDailySpendingLimit(capacity, 0);
        aiMessage = `Tuyệt vời! Bạn trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, đủ để hoàn thành mục tiêu "${name}" trị giá "${formatVnd(target)}" ngay lập tức! Bạn có muốn tiến hành tạo mục tiêu ngay không?`;
      } else if (hasRequestedDays) {
        daysEstimate = Math.max(1, Math.round(parsedRequestedDays));
        monthsEstimate = Math.max(1, Math.ceil(daysEstimate / daysInMonth));
        const durationMessage = buildSavingGoalDurationMessage({
          name,
          target: Number(target),
          amountToSave: remainingTarget,
          months: daysEstimate / daysInMonth,
          days: daysEstimate,
          capacity,
          plannedSavingCapacity,
          mode: 'with_init_fund',
          initFund: activeInitFund,
          sourceWalletName,
        });
        suggestedMonthlySaving = durationMessage.requiredPerMonth;
        suggestedDailySaving = roundVndUp(remainingTarget / daysEstimate);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        maxMonthlySaving = durationMessage.maxMonthlySaving;
        isWarning = durationMessage.isWarning;
        aiMessage = durationMessage.aiMessage;
      } else if (hasRequestedMonths) {
        monthsEstimate = Math.max(1, Math.round(parsedRequestedMonths));
        daysEstimate = monthsEstimate * daysInMonth;
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
        suggestedDailySaving = roundVndUp(suggestedMonthlySaving / daysInMonth);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        maxMonthlySaving = durationMessage.maxMonthlySaving;
        isWarning = durationMessage.isWarning;
        aiMessage = durationMessage.aiMessage;
      } else if (capacity && plannedSavingCapacity > 0) {
        const recommendation = buildSavingGoalRecommendation(
          remainingTarget,
          plannedSavingCapacity,
          daysInMonth,
        );
        monthsEstimate = recommendation.months;
        daysEstimate = recommendation.daysEstimate;
        suggestedMonthlySaving = recommendation.suggestedMonthlySaving;
        suggestedDailySaving = recommendation.suggestedDailySaving;
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        maxMonthlySaving = recommendation.maxMonthlySaving;

        aiMessage = `Sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, bạn còn thiếu "${formatVnd(remainingTarget)}" cho mục tiêu "${name}".\n\n💡 Để kế hoạch thoải mái, tôi đề xuất mốc "${recommendation.months} tháng", tương đương khoảng "${formatVnd(recommendation.suggestedMonthlySaving)}/tháng" (nằm trong khả năng tiết kiệm "${formatVnd(plannedSavingCapacity)}/tháng" của bạn).`;
      } else if (capacity) {
        monthsEstimate = 6;
        daysEstimate = monthsEstimate * daysInMonth;
        suggestedMonthlySaving = roundVndUp(remainingTarget / 6);
        suggestedDailySaving = roundVndUp(suggestedMonthlySaving / daysInMonth);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" (còn thiếu "${formatVnd(remainingTarget)}" sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Vì kế hoạch chi tiêu hiện tại của bạn chưa có thặng dư để tích lũy (khả năng tiết kiệm hiện tại là 0đ/tháng), tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(suggestedMonthlySaving)}/tháng"). Bạn có thể điều chỉnh kế hoạch chi tiêu để gia tăng tích lũy nhé!`;
      } else {
        monthsEstimate = 6;
        daysEstimate = monthsEstimate * daysInMonth;
        suggestedMonthlySaving = roundVndUp(remainingTarget / 6);
        suggestedDailySaving = roundVndUp(suggestedMonthlySaving / daysInMonth);
        suggestedDailySpending = this.buildDailySpendingLimit(
          capacity,
          suggestedMonthlySaving,
        );
        aiMessage = `Tôi đã ghi nhận mục tiêu "${name}" (còn thiếu "${formatVnd(remainingTarget)}" sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}"). Vì bạn chưa có Kế hoạch chi tiêu, tôi đề xuất thời gian tích lũy là "6 tháng" (tương đương khoảng "${formatVnd(suggestedMonthlySaving)}/tháng").`;
      }

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + Math.max(1, daysEstimate));
      const durationOptions =
        hasRequestedDuration || remainingTarget <= 0
          ? []
          : buildDailyDurationOptions(
              remainingTarget,
              daysEstimate,
              daysInMonth,
            );
      const preserveCurrentBudget =
        !hasRequestedDuration &&
        remainingTarget > 0 &&
        !!capacity &&
        plannedSavingCapacity > 0 &&
        (capacity.estimatedExpenses?.length ?? 0) > 0;
      const shouldSkipBudgetProposal =
        preserveCurrentBudget ||
        (hasRequestedDuration &&
          !!capacity &&
          (capacity.estimatedExpenses?.length ?? 0) > 0);
      const budgetPlan = shouldSkipBudgetProposal
        ? {
            totalAmount: Math.max(0, Math.round(capacity?.totalAmount ?? 0)),
            budgetItems: [],
          }
        : await this.buildBudgetPlanProposal(
            userId,
            capacity,
            suggestedMonthlySaving,
          );
      if (
        !hasRequestedDuration &&
        remainingTarget > 0 &&
        plannedSavingCapacity > 0
      ) {
        aiMessage = `Sau khi trích "${formatVnd(activeInitFund)}" từ "${sourceWalletName}" làm vốn ban đầu, bạn còn thiếu "${formatVnd(remainingTarget)}" cho mục tiêu "${name}". Với số dư hiện tại "${formatVnd(maxMonthlySaving)}/tháng", bạn cần khoảng "${formatDurationFromDays(daysEstimate)}" và giữ mức chi tiêu trung bình khoảng "${formatVnd(suggestedDailySpending)}/ngày".`;
      }

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
          daysEstimate,
          endDate: endDate.toISOString(),
          monthlySavingCapacity: plannedSavingCapacity,
          dailySavingCapacity: capacity?.dailySavingCapacity ?? 0,
          totalAmount: budgetPlan.totalAmount,
          suggestedMonthlySaving,
          suggestedDailySaving,
          suggestedDailySpending,
          maxMonthlySaving,
          durationOptions,
          budgetItems: budgetPlan.budgetItems,
          preserveCurrentBudget,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning,
          isRequestedDuration: hasRequestedDuration,
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

      const {
        name,
        target,
        months,
        days,
        initFund,
        sourceWalletId,
        preserveCurrentBudget = false,
      } = payload;
      const activeInitFund = Number(initFund) || 0;
      const remainingTarget = Math.max(0, Number(target) - activeInitFund);

      const capacity =
        await this.spendingPlansService.getMonthlySavingCapacity(userId);
      const plannedSavingCapacity = capacity
        ? Math.max(
            0,
            capacity.monthlySavingCapacity ??
              capacity.totalAmount - capacity.fixedExpenseTotal,
          )
        : 0;
      const daysInMonth = capacity?.daysInMonth ?? 30;
      const requestedDays = Math.max(
        1,
        Math.round(Number(days) || Number(months) * daysInMonth || daysInMonth),
      );
      const requestedMonths = Math.max(
        1,
        Math.ceil(requestedDays / daysInMonth),
      );
      const requiredPerDay = roundVndUp(remainingTarget / requestedDays);
      const requiredPerMonth = roundVndUp(
        remainingTarget / (requestedDays / daysInMonth),
      );
      const suggestedDailySpending = this.buildDailySpendingLimit(
        capacity,
        requiredPerMonth,
      );
      const maxMonthlySaving = plannedSavingCapacity;

      const durationMessage = buildSavingGoalDurationMessage({
        name,
        target,
        amountToSave: remainingTarget,
        months: requestedDays / daysInMonth,
        days: requestedDays,
        capacity,
        plannedSavingCapacity,
        mode: activeInitFund > 0 ? 'with_init_fund' : 'change_duration',
        initFund: activeInitFund,
        sourceWalletName: sourceWalletId ? 'ví đã chọn' : '',
      });

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + requestedDays);
      const durationOptions: ReturnType<typeof buildDailyDurationOptions> = [];
      const budgetPlan = {
        totalAmount: Math.max(0, Math.round(capacity?.totalAmount ?? 0)),
        budgetItems: [],
      };
      const aiMessage =
        remainingTarget <= 0
          ? durationMessage.aiMessage
          : `Nếu hoàn thành trong "${formatDurationFromDays(requestedDays)}", bạn cần giữ mức chi tiêu trung bình khoảng "${formatVnd(suggestedDailySpending)}/ngày" để đạt mục tiêu "${name}". Tính theo tháng, phần cần tích lũy là khoảng "${formatVnd(requiredPerMonth)}/tháng".`;

      return {
        success: true,
        statusCode: 200,
        message: `${AiMessagePrefix.SAVING_GOAL_PROPOSAL}${JSON.stringify({
          name,
          target,
          initFund: activeInitFund,
          sourceWalletId: Number(sourceWalletId) || 0,
          remainingTarget,
          monthsEstimate: requestedMonths,
          daysEstimate: requestedDays,
          monthlySavingCapacity: plannedSavingCapacity,
          dailySavingCapacity: capacity?.dailySavingCapacity ?? 0,
          totalAmount: budgetPlan.totalAmount,
          suggestedMonthlySaving: requiredPerMonth,
          suggestedDailySaving: requiredPerDay,
          suggestedDailySpending,
          maxMonthlySaving,
          durationOptions,
          budgetItems: budgetPlan.budgetItems,
          preserveCurrentBudget,
          hasPlan: !!capacity,
          isImpossible: false,
          isWarning: durationMessage.isWarning,
          isRequestedDuration: true,
          aiMessage,
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

  private async buildBudgetPlanProposal(
    userId: number,
    capacity: SavingCapacityContext,
    suggestedMonthlySaving: number,
  ): Promise<SavingGoalBudgetPlanProposal> {
    const monthlySaving = Math.max(0, Math.round(suggestedMonthlySaving || 0));
    const totalAmount = Math.max(
      0,
      Math.round(
        Number(capacity?.totalAmount ?? 0) ||
          (monthlySaving > 0 ? monthlySaving * 5 : 0),
      ),
    );
    const expenseBudget = Math.max(0, totalAmount - monthlySaving);
    if (expenseBudget <= 0) {
      return {
        totalAmount,
        budgetItems: [],
      };
    }

    const baselineItems = (capacity?.estimatedExpenses ?? [])
      .map((item) => {
        const monthlyLimit = Math.max(
          0,
          Math.round(Number(item.monthlyLimit ?? item.amount) || 0),
        );
        return {
          categoryId: Number(item.categoryId) || undefined,
          categoryName: item.categoryName || 'Khoản chi',
          amount: monthlyLimit,
          monthlyLimit,
          frequencyType:
            item.frequencyType ?? SpendingPlanExpenseFrequency.MONTHLY,
          frequencyValue: Math.max(1, Number(item.frequencyValue) || 1),
        };
      })
      .filter((item) => item.monthlyLimit > 0);

    if (baselineItems.length) {
      const baselineTotal = baselineItems.reduce(
        (sum, item) => sum + item.monthlyLimit,
        0,
      );
      if (expenseBudget >= baselineTotal) {
        return {
          totalAmount,
          budgetItems: baselineItems,
        };
      }

      return {
        totalAmount,
        budgetItems: [],
        isCapped: true,
      };
    }

    const budgetTemplate = await this.buildUserBudgetTemplate(userId);

    const budgetItems = budgetTemplate.flatMap(({ category, weight }) => {
      if (!category) return [];

      const amount = Math.round(expenseBudget * weight);
      if (amount <= 0) return [];

      return [
        {
          categoryId: category.id,
          categoryName: category.name,
          amount,
          monthlyLimit: amount,
          frequencyType: SpendingPlanExpenseFrequency.MONTHLY,
          frequencyValue: 1,
        },
      ];
    });

    return {
      totalAmount,
      budgetItems,
    };
  }

  private buildDailySpendingLimit(
    capacity: SavingCapacityContext,
    requiredMonthlySaving: number,
  ): number {
    const totalAmount = Number(capacity?.totalAmount ?? 0);
    const daysInMonth = Math.max(1, Number(capacity?.daysInMonth) || 30);
    if (totalAmount <= 0) return 0;

    return roundVndUp(
      Math.max(0, totalAmount - requiredMonthlySaving) / daysInMonth,
    );
  }

  private async buildUserBudgetTemplate(
    userId: number,
  ): Promise<Array<{ category: Category; weight: number }>> {
    const preferences = await this.userCategoryPreferenceRepo.find({
      where: {
        user: { id: userId },
        isEssential: true,
        category: { type: CategoryType.EXPENSE },
      },
      relations: ['category'],
      order: { id: 'ASC' },
    });

    const preferredCategories = preferences
      .map((preference) => preference.category)
      .filter((category): category is Category => !!category);

    if (preferredCategories.length) {
      const templateWeights = new Map(
        BUDGET_TEMPLATE.map((item) => [norm(item.name), item.weight]),
      );
      const weighted = preferredCategories.map((category) => ({
        category,
        weight:
          templateWeights.get(norm(category.name)) ??
          1 / preferredCategories.length,
      }));
      const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
      return weighted.map((item) => ({
        category: item.category,
        weight: totalWeight > 0 ? item.weight / totalWeight : 0,
      }));
    }

    const categoryNames = BUDGET_TEMPLATE.map((item) => item.name);
    const categories = await this.categoryRepo.find({
      where: {
        name: In(categoryNames),
        type: CategoryType.EXPENSE,
        is_system: true,
      },
    });
    const categoriesByName = new Map(
      categories.map((category) => [category.name, category]),
    );

    return BUDGET_TEMPLATE.flatMap((template) => {
      const category = categoriesByName.get(template.name);
      return category ? [{ category, weight: template.weight }] : [];
    });
  }

  private async createAndActivateSuggestedPlan(
    userId: number,
    payload: ConfirmSavingGoalPayload,
    fallbackSuggestedMonthlySaving: number,
  ): Promise<{ created: boolean; planId?: number }> {
    const normalizedItems = (payload.budgetItems ?? [])
      .map((item) => ({
        categoryId: Number(item.categoryId) || undefined,
        category: item.categoryName,
        amount: Math.max(0, Math.round(Number(item.amount) || 0)),
        monthlyLimit: Math.max(
          0,
          Math.round(Number(item.monthlyLimit ?? item.amount) || 0),
        ),
        frequencyType:
          item.frequencyType ?? SpendingPlanExpenseFrequency.MONTHLY,
        frequencyValue: Math.max(1, Number(item.frequencyValue) || 1),
      }))
      .filter((item) => item.amount > 0 && (item.categoryId || item.category));

    if (!normalizedItems.length) {
      return { created: false };
    }

    const totalAmount = Math.max(
      0,
      Math.round(
        Number(payload.totalAmount) ||
          normalizedItems.reduce((sum, item) => sum + item.amount, 0) +
            Math.max(0, fallbackSuggestedMonthlySaving),
      ),
    );

    try {
      const createResult = await this.spendingPlansService.create(userId, {
        totalAmount,
        estimatedExpenses: normalizedItems,
      });
      const planId = createResult.data?.id;
      if (!planId) return { created: false };

      await this.spendingPlansService.activate(planId, userId);
      return { created: true, planId };
    } catch (error) {
      this.logger.error(
        'Failed to create and activate suggested spending plan',
        error,
      );
      return { created: false };
    }
  }
}
