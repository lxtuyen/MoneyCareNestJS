import { AiSavingGoalChatService } from './ai-saving-goal-chat.service';
import { Repository } from 'typeorm';
import { Wallet } from 'src/modules/wallets/entities/wallet.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { SavingGoalsService } from 'src/modules/saving-goals/saving-goals.service';
import { WalletsService } from 'src/modules/wallets/wallets.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import { AiMessagePrefix } from './types/ai.types';

describe('AiSavingGoalChatService', () => {
  const spendingPlansService = { getMonthlySavingCapacity: jest.fn() };
  const savingGoalsService = { create: jest.fn() };
  const walletsService = { transfer: jest.fn() };
  const geminiClient = { generateToolContent: jest.fn() };
  const walletRepo = { find: jest.fn(), findOne: jest.fn() };
  const userRepo = { findOne: jest.fn() };

  let service: AiSavingGoalChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiSavingGoalChatService(
      spendingPlansService as unknown as SpendingPlansService,
      savingGoalsService as unknown as SavingGoalsService,
      walletsService as unknown as WalletsService,
      geminiClient as unknown as AiGeminiClientService,
      walletRepo as unknown as Repository<Wallet>,
      userRepo as unknown as Repository<User>,
    );
  });

  it('returns saving goal proposal when user has no positive wallet', async () => {
    spendingPlansService.getMonthlySavingCapacity.mockResolvedValueOnce(null);
    geminiClient.generateToolContent.mockResolvedValueOnce({
      functionCalls: [
        {
          args: {
            name: 'Phone',
            target: 6000000,
            months_estimate: 6,
            requested_months: null,
          },
        },
      ],
    });
    walletRepo.find.mockResolvedValueOnce([]);

    const result = await service.handleSavingGoalRequest('save 6m', 1);

    expect(result.message).toContain(AiMessagePrefix.SAVING_GOAL_PROPOSAL);
    const payload = parsePrefixedPayload(
      result.message,
      AiMessagePrefix.SAVING_GOAL_PROPOSAL,
    );
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Phone',
        target: 6000000,
        monthsEstimate: 6,
        hasPlan: false,
      }),
    );
  });

  it('asks for initial fund when user has a positive wallet', async () => {
    spendingPlansService.getMonthlySavingCapacity.mockResolvedValueOnce(null);
    geminiClient.generateToolContent.mockResolvedValueOnce({
      functionCalls: [
        {
          args: {
            name: 'Trip',
            target: 5000000,
            months_estimate: 6,
            requested_months: 4,
          },
        },
      ],
    });
    walletRepo.find.mockResolvedValueOnce([
      { id: 10, name: 'Cash', balance: 1000000, type: 'cash' },
      { id: 11, name: 'Bank', balance: 3000000, type: 'bank' },
    ]);

    const result = await service.handleSavingGoalRequest('save 5m', 1);

    expect(result.message).toContain(
      AiMessagePrefix.SAVING_GOAL_INITIAL_FUND_ASK,
    );
    const payload = parsePrefixedPayload(
      result.message,
      AiMessagePrefix.SAVING_GOAL_INITIAL_FUND_ASK,
    );
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Trip',
        totalBalance: 4000000,
        suggestedWalletId: 11,
        requestedMonths: 4,
      }),
    );
  });

  it('marks requested duration as warning when monthly saving exceeds capacity', async () => {
    spendingPlansService.getMonthlySavingCapacity.mockResolvedValueOnce({
      totalAmount: 10000000,
      fixedExpenseTotal: 6000000,
      projectedEndBalance: 0,
    });
    geminiClient.generateToolContent.mockResolvedValueOnce({
      functionCalls: [
        {
          args: {
            name: 'Laptop',
            target: 12000000,
            months_estimate: 2,
            requested_months: 2,
          },
        },
      ],
    });
    walletRepo.find.mockResolvedValueOnce([]);

    const result = await service.handleSavingGoalRequest('save laptop', 1);
    const payload = parsePrefixedPayload(
      result.message,
      AiMessagePrefix.SAVING_GOAL_PROPOSAL,
    );

    expect(payload.isWarning).toBe(true);
    expect(payload.suggestedMonthlySaving).toBe(6000000);
  });

  it('keeps zero remaining target payload when initial fund covers target', async () => {
    spendingPlansService.getMonthlySavingCapacity.mockResolvedValueOnce(null);
    walletRepo.find.mockResolvedValueOnce([
      { id: 7, name: 'Cash', balance: 7000000, type: 'cash' },
    ]);

    const result = await service.handleSavingGoalInitFund(
      '/saving_goal_init_fund {"name":"Phone","target":5000000,"initFund":5000000,"sourceWalletId":7,"requestedMonths":6}',
      1,
    );
    const payload = parsePrefixedPayload(
      result.message,
      AiMessagePrefix.SAVING_GOAL_PROPOSAL,
    );

    expect(payload).toEqual(
      expect.objectContaining({
        remainingTarget: 0,
        monthsEstimate: 0,
        suggestedMonthlySaving: 0,
        durationOptions: [],
      }),
    );
  });

  it('returns created payload when confirming without initial transfer', async () => {
    savingGoalsService.create.mockResolvedValueOnce({
      data: { id: 99, wallet: { id: 20, name: 'Goal wallet' } },
    });
    spendingPlansService.getMonthlySavingCapacity.mockResolvedValueOnce(null);
    userRepo.findOne.mockResolvedValueOnce({ id: 1 });

    const result = await service.handleConfirmSavingGoal(
      '/confirm_saving_goal {"name":"Phone","target":6000000,"months":6}',
      1,
    );
    const payload = parsePrefixedPayload(
      result.message,
      AiMessagePrefix.SAVING_GOAL_CREATED,
    );

    expect(payload).toEqual(
      expect.objectContaining({
        goalId: 99,
        name: 'Phone',
        target: 6000000,
        monthsEstimate: 6,
        initFund: 0,
      }),
    );
  });
});

function parsePrefixedPayload(message: string, prefix: string) {
  return JSON.parse(message.replace(prefix, '')) as Record<string, any>;
}
