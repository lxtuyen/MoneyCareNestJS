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
          'TÃ´i chÆ°a hiá»ƒu rÃµ má»¥c tiÃªu tiáº¿t kiá»‡m cá»§a báº¡n. Báº¡n cÃ³ thá»ƒ nÃ³i rÃµ hÆ¡n khÃ´ng? VÃ­ dá»¥: "TÃ´i muá»‘n tiáº¿t kiá»‡m 3 triá»‡u mua Ä‘iá»‡n thoáº¡i".',
        );
      }

      const name = args.name || 'Má»¥c tiÃªu tiáº¿t kiá»‡m';
      const target = Number(args.target) || 0;
      const requestedMonths = Number(args.requested_months) || 0;

      const activeWallets = await this.walletRepo.find({
        where: { user: { id: userId }, is_active: true },
      });
      const positiveWallets = activeWallets.filter(
        (w) => w.type !== 'saving' && Number(w.balance) > 0,
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
          type: w.type,
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

        aiMessage = `Vá»›i kháº£ nÄƒng tiáº¿t kiá»‡m tá»‘i Ä‘a hiá»‡n táº¡i lÃ  "${formatVnd(recommendation.maxMonthlySaving)}/thÃ¡ng", náº¿u dÃ¹ng háº¿t sá»‘ dÆ° báº¡n sáº½ cáº§n khoáº£ng "${recommendation.rawDurationText}" Ä‘á»ƒ tÃ­ch lÅ©y Ä‘á»§ "${formatVnd(target)}" cho má»¥c tiÃªu "${name}".\n\nðŸ’¡ Äá»ƒ káº¿ hoáº¡ch dá»… theo dÃµi vÃ  khÃ´ng dÃ¹ng háº¿t toÃ n bá»™ sá»‘ dÆ° má»—i thÃ¡ng, tÃ´i Ä‘á» xuáº¥t má»‘c "${recommendation.months} thÃ¡ng", tÆ°Æ¡ng Ä‘Æ°Æ¡ng khoáº£ng "${formatVnd(recommendation.suggestedMonthlySaving)}/thÃ¡ng". Báº¡n váº«n cÃ³ thá»ƒ Ä‘á»•i thá»i gian náº¿u muá»‘n hoÃ n thÃ nh nhanh hÆ¡n hoáº·c thoáº£i mÃ¡i hÆ¡n.`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(target / 6);
        aiMessage = `TÃ´i Ä‘Ã£ ghi nháº­n Ä‘á» xuáº¥t tÃ­ch lÅ©y "${formatVnd(target)}" cho má»¥c tiÃªu "${name}". VÃ¬ káº¿ hoáº¡ch chi tiÃªu hiá»‡n táº¡i cá»§a báº¡n chÆ°a cÃ³ tháº·ng dÆ° Ä‘á»ƒ tÃ­ch lÅ©y (kháº£ nÄƒng tiáº¿t kiá»‡m hiá»‡n táº¡i lÃ  0Ä‘/thÃ¡ng), tÃ´i Ä‘á» xuáº¥t thá»i gian tÃ­ch lÅ©y lÃ  "6 thÃ¡ng" (tÆ°Æ¡ng Ä‘Æ°Æ¡ng khoáº£ng "${formatVnd(suggestedMonthlySaving)}/thÃ¡ng"). Báº¡n hÃ£y Ä‘iá»u chá»‰nh káº¿ hoáº¡ch chi tiÃªu hoáº·c cáº¯t giáº£m chi phÃ­ Ä‘á»ƒ gia tÄƒng kháº£ nÄƒng tiáº¿t kiá»‡m nhÃ©!`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(target / 6);
        aiMessage = `TÃ´i Ä‘Ã£ ghi nháº­n Ä‘á» xuáº¥t tÃ­ch lÅ©y "${formatVnd(target)}" cho má»¥c tiÃªu "${name}". VÃ¬ báº¡n chÆ°a thiáº¿t láº­p Káº¿ hoáº¡ch chi tiÃªu, tÃ´i Ä‘á» xuáº¥t thá»i gian tÃ­ch lÅ©y lÃ  "6 thÃ¡ng" (tÆ°Æ¡ng Ä‘Æ°Æ¡ng khoáº£ng "${formatVnd(Math.round(target / 6))}/thÃ¡ng"). Báº¡n hÃ£y láº­p Káº¿ hoáº¡ch chi tiÃªu Ä‘á»ƒ theo dÃµi chÃ­nh xÃ¡c hÆ¡n nhÃ©!`;
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
    } catch {
      return ok(
        '',
        'TÃ´i gáº·p lá»—i khi Ä‘á» xuáº¥t má»¥c tiÃªu tiáº¿t kiá»‡m. Báº¡n vui lÃ²ng thá»­ láº¡i nhÃ©!',
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
          name: name || 'Má»¥c tiÃªu tiáº¿t kiá»‡m',
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
                note: `TÃ­ch lÅ©y ban Ä‘áº§u cho má»¥c tiÃªu: ${name}`,
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

      let aiMessage = `Tuyá»‡t vá»i! TÃ´i Ä‘Ã£ táº¡o thÃ nh cÃ´ng má»¥c tiÃªu "${name}" vá»›i sá»‘ tiá»n cáº§n tÃ­ch lÅ©y lÃ  "${formatVnd(target)}" trong vÃ²ng "${monthsEstimate} thÃ¡ng". Má»™t vÃ­ má»¥c tiÃªu má»›i cÅ©ng Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t Ä‘á»ƒ báº¡n báº¯t Ä‘áº§u tÃ­ch lÅ©y!`;
      if (transferSuccess && activeInitFund > 0) {
        aiMessage = `Tuyá»‡t vá»i! TÃ´i Ä‘Ã£ táº¡o thÃ nh cÃ´ng má»¥c tiÃªu "${name}" vá»›i sá»‘ tiá»n cáº§n tÃ­ch lÅ©y lÃ  "${formatVnd(target)}" trong vÃ²ng "${monthsEstimate} thÃ¡ng". Äá»“ng thá»i, tÃ´i Ä‘Ã£ tá»± Ä‘á»™ng trÃ­ch "${formatVnd(activeInitFund)}" tá»« "${sourceWalletName}" chuyá»ƒn sang vÃ­ tÃ­ch lÅ©y "${createdGoal?.wallet?.name}" cá»§a má»¥c tiÃªu nÃ y lÃ m vá»‘n ban Ä‘áº§u!`;
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
    } catch {
      return {
        success: true,
        statusCode: 200,
        message:
          'CÃ³ lá»—i xáº£y ra khi xÃ¡c nháº­n táº¡o má»¥c tiÃªu tiáº¿t kiá»‡m. Vui lÃ²ng thá»­ láº¡i!',
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
      const sourceWalletName = sourceWallet?.name ?? 'vÃ­ Ä‘Ã£ chá»n';

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
        aiMessage = `Tuyá»‡t vá»i! Báº¡n trÃ­ch "${formatVnd(activeInitFund)}" tá»« "${sourceWalletName}" lÃ m vá»‘n ban Ä‘áº§u, Ä‘á»§ Ä‘á»ƒ hoÃ n thÃ nh má»¥c tiÃªu "${name}" trá»‹ giÃ¡ "${formatVnd(target)}" ngay láº­p tá»©c! Báº¡n cÃ³ muá»‘n tiáº¿n hÃ nh táº¡o má»¥c tiÃªu ngay khÃ´ng?`;
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

        aiMessage = `Sau khi trÃ­ch "${formatVnd(activeInitFund)}" tá»« "${sourceWalletName}" lÃ m vá»‘n ban Ä‘áº§u, báº¡n cÃ²n thiáº¿u "${formatVnd(remainingTarget)}" cho má»¥c tiÃªu "${name}".\n\nðŸ’¡ Äá»ƒ káº¿ hoáº¡ch thoáº£i mÃ¡i, tÃ´i Ä‘á» xuáº¥t má»‘c "${recommendation.months} thÃ¡ng", tÆ°Æ¡ng Ä‘Æ°Æ¡ng khoáº£ng "${formatVnd(recommendation.suggestedMonthlySaving)}/thÃ¡ng" (náº±m trong kháº£ nÄƒng tiáº¿t kiá»‡m "${formatVnd(plannedSavingCapacity)}/thÃ¡ng" cá»§a báº¡n).`;
      } else if (capacity) {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(remainingTarget / 6);
        aiMessage = `TÃ´i Ä‘Ã£ ghi nháº­n má»¥c tiÃªu "${name}" (cÃ²n thiáº¿u "${formatVnd(remainingTarget)}" sau khi trÃ­ch "${formatVnd(activeInitFund)}" tá»« "${sourceWalletName}"). VÃ¬ káº¿ hoáº¡ch chi tiÃªu hiá»‡n táº¡i cá»§a báº¡n chÆ°a cÃ³ tháº·ng dÆ° Ä‘á»ƒ tÃ­ch lÅ©y (kháº£ nÄƒng tiáº¿t kiá»‡m hiá»‡n táº¡i lÃ  0Ä‘/thÃ¡ng), tÃ´i Ä‘á» xuáº¥t thá»i gian tÃ­ch lÅ©y lÃ  "6 thÃ¡ng" (tÆ°Æ¡ng Ä‘Æ°Æ¡ng khoáº£ng "${formatVnd(suggestedMonthlySaving)}/thÃ¡ng"). Báº¡n cÃ³ thá»ƒ Ä‘iá»u chá»‰nh káº¿ hoáº¡ch chi tiÃªu Ä‘á»ƒ gia tÄƒng tÃ­ch lÅ©y nhÃ©!`;
      } else {
        monthsEstimate = 6;
        suggestedMonthlySaving = Math.round(remainingTarget / 6);
        aiMessage = `TÃ´i Ä‘Ã£ ghi nháº­n má»¥c tiÃªu "${name}" (cÃ²n thiáº¿u "${formatVnd(remainingTarget)}" sau khi trÃ­ch "${formatVnd(activeInitFund)}" tá»« "${sourceWalletName}"). VÃ¬ báº¡n chÆ°a cÃ³ Káº¿ hoáº¡ch chi tiÃªu, tÃ´i Ä‘á» xuáº¥t thá»i gian tÃ­ch lÅ©y lÃ  "6 thÃ¡ng" (tÆ°Æ¡ng Ä‘Æ°Æ¡ng khoáº£ng "${formatVnd(suggestedMonthlySaving)}/thÃ¡ng").`;
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
    } catch {
      return {
        success: true,
        statusCode: 200,
        message:
          'TÃ´i gáº·p lá»—i khi Ä‘á» xuáº¥t lá»™ trÃ¬nh dá»±a trÃªn sá»‘ vá»‘n ban Ä‘áº§u. Vui lÃ²ng thá»­ láº¡i!',
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
    } catch {
      return {
        success: true,
        statusCode: 200,
        message:
          'CÃ³ lá»—i xáº£y ra khi Ä‘iá»u chá»‰nh thá»i gian má»¥c tiÃªu. Vui lÃ²ng thá»­ láº¡i!',
      };
    }
  }
}
