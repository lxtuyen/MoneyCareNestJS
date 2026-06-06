import { AiScenarioWhatIfChatService } from './ai-scenario-what-if-chat.service';
import { AiGeminiClientService } from './ai-gemini-client.service';
import { ScenarioPlanningService } from 'src/modules/scenario-planning/scenario-planning.service';

describe('AiScenarioWhatIfChatService', () => {
  let service: AiScenarioWhatIfChatService;
  const scenarioPlanningService = {
    simulate: jest.fn(),
  };
  const geminiClient = {
    generateToolContent: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AiScenarioWhatIfChatService(
      scenarioPlanningService as unknown as ScenarioPlanningService,
      geminiClient as unknown as AiGeminiClientService,
    );
  });

  it('parses income drop what-if with deterministic fallback', async () => {
    const parsed = await service.parseScenario('nếu lương giảm 20% thì sao');

    expect(parsed.scenarioType).toBe('income_drop');
    expect(parsed.incomeDropPct).toBe(20);
    expect(geminiClient.generateToolContent).not.toHaveBeenCalled();
  });

  it('parses frequency reduction what-if with deterministic fallback', async () => {
    const parsed = await service.parseScenario(
      'nếu giảm trà sữa từ 5 ly/tuần xuống 2 ly/tuần, mỗi ly 30k thì sao',
    );

    expect(parsed.scenarioType).toBe('reduce_frequency_expense');
    expect(parsed.itemName).toBe('tra sua');
    expect(parsed.currentFrequencyPerWeek).toBe(5);
    expect(parsed.newFrequencyPerWeek).toBe(2);
    expect(parsed.averageAmount).toBe(30000);
  });

  it('parses one-time purchase fallback without leading neu', async () => {
    const parsed = await service.parseScenario('haidilao 100k thì sao');

    expect(parsed.scenarioType).toBe('one_time_purchase');
    expect(parsed.amount).toBe(100000);
    expect(parsed.itemName).toContain('haidilao');
    expect(parsed.categoryName).toBe('Ăn uống');
  });

  it('removes filler words from one-time purchase label', async () => {
    const parsed = await service.parseScenario(
      'nếu tôi đi xem phim hết 145k thì sao',
    );

    expect(parsed.scenarioType).toBe('one_time_purchase');
    expect(parsed.amount).toBe(145000);
    expect(parsed.itemName).toBe('xem phim');
    expect(parsed.categoryName).toBe('Giải trí');
  });

  it('does not duplicate preposition for purchase labels', async () => {
    const parsed = await service.parseScenario(
      'nếu tôi chi 145k cho xem phim hết thì sao',
    );

    expect(parsed.scenarioType).toBe('one_time_purchase');
    expect(parsed.amount).toBe(145000);
    expect(parsed.itemName).toBe('xem phim');
    expect(parsed.categoryName).toBe('Giải trí');
  });

  it('asks for amount when a what-if purchase has no amount', async () => {
    const result = await service.handleWhatIf(
      'nếu tôi đi ăn Haidilao thì sao',
      1,
    );

    expect(result.message).toContain('Bạn muốn mô phỏng khoảng bao nhiêu tiền');
    expect(result.message).toContain('Haidilao 100k thì sao');
    expect(scenarioPlanningService.simulate).not.toHaveBeenCalled();
  });

  it('returns plain text advice with budget context and practical suggestion', async () => {
    scenarioPlanningService.simulate.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'ok',
      data: {
        scenarioId: 'sim_test',
        scenarioType: 'one_time_purchase',
        title: 'Chi một khoản phát sinh',
        summary: 'Khoản chi một lần làm giảm dòng tiền tháng này.',
        monthlySaving: -100000,
        monthlyExpenseChange: 100000,
        monthlyIncomeChange: 0,
        expectedSavingsAfter: 900000,
        budgetRiskBefore: 'low',
        budgetRiskAfter: 'medium',
        goalImpacts: [
          {
            goalId: 1,
            goalName: 'Mua điện thoại',
            currentPredictedCompletionDate: '2026-10-18',
            newPredictedCompletionDate: '2026-10-20',
            impactDays: 2,
            impactText: 'Mục tiêu có thể trễ hơn 2 ngày.',
            currentStatus: 'on_track',
            newStatus: 'slightly_at_risk',
            currentMonthlySavingRate: 1000000,
            newMonthlySavingRate: 900000,
            requiredMonthlySavingRate: 1000000,
            newRequiredMonthlySavingRate: 1100000,
            currentDaysDifference: 0,
            newDaysDifference: 2,
          },
        ],
        recommendedActions: [
          {
            actionType: 'pause_discretionary_spending',
            amount: 100000,
            message:
              'Cân nhắc bù lại khoản chi này bằng cách giảm các khoản linh hoạt.',
            priority: 'high',
          },
        ],
        confidence: 0.78,
        reasonCodes: ['one_time_purchase_impact'],
        supportingData: {
          baselineMonthlySaving: 1000000,
          newMonthlySaving: 900000,
          projectedFlexibleBalanceBefore: 1200000,
          projectedFlexibleBalanceAfter: 1100000,
          categoryContext: {
            categoryName: 'Ăn uống',
            monthlyAverage: 1500000,
            monthlyLimit: 2000000,
            forecastBefore: 1500000,
            forecastAfter: 1600000,
            remainingLimitBefore: 500000,
            remainingLimitAfter: 400000,
            usagePctAfter: 80,
          },
        },
        createdAt: '2026-06-06T10:00:00.000Z',
      },
    });

    const result = await service.handleWhatIf(
      'nếu tôi đi ăn lẩu Haidilao 100k thì sao',
      1,
      9,
    );

    expect(scenarioPlanningService.simulate).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        scenarioType: 'one_time_purchase',
        goalIds: [9],
        params: expect.objectContaining({
          amount: 100000,
          categoryName: 'Ăn uống',
        }),
      }),
    );
    expect(result.message).toBeDefined();
    expect(result.message!.startsWith('__SCENARIO_SIMULATION__')).toBe(true);
    const jsonStr = result.message!.replace('__SCENARIO_SIMULATION__', '');
    const payload = JSON.parse(jsonStr);
    expect(payload.categoryContext.categoryName).toBe('Ăn uống');
    expect(payload.goalImpact.goalName).toBe('Mua điện thoại');
    expect(payload.goalImpact.currentStatus).toBe('on_track');
    expect(payload.goalImpact.newStatus).toBe('slightly_at_risk');
    expect(payload.fallbackText).toContain('Nhóm Ăn uống');
    expect(payload.fallbackText).toContain('Mua điện thoại": Đúng tiến độ -> Rủi ro nhẹ');
  });

  it('omits category limit warning when no category limit data is configured', async () => {
    scenarioPlanningService.simulate.mockResolvedValueOnce({
      success: true,
      statusCode: 200,
      message: 'ok',
      data: {
        scenarioId: 'sim_test',
        scenarioType: 'one_time_purchase',
        title: 'Chi một khoản phát sinh',
        summary: 'Khoản chi một lần làm giảm dòng tiền tháng này.',
        monthlySaving: -145000,
        monthlyExpenseChange: 145000,
        monthlyIncomeChange: 0,
        expectedSavingsAfter: 241500,
        budgetRiskBefore: 'low',
        budgetRiskAfter: 'medium',
        goalImpacts: [],
        recommendedActions: [],
        confidence: 0.64,
        reasonCodes: ['one_time_purchase_impact'],
        supportingData: {
          baselineMonthlySaving: 386500,
          newMonthlySaving: 241500,
          projectedFlexibleBalanceBefore: -1900000,
          projectedFlexibleBalanceAfter: -2045000,
          categoryContext: {
            categoryName: 'Giải trí',
          },
        },
        createdAt: '2026-06-06T10:00:00.000Z',
      },
    });

    const result = await service.handleWhatIf(
      'nếu tôi đi xem phim hết 145k thì sao',
      1,
    );

    expect(result.message!.startsWith('__SCENARIO_SIMULATION__')).toBe(true);
    const jsonStr = result.message!.replace('__SCENARIO_SIMULATION__', '');
    const payload = JSON.parse(jsonStr);
    expect(payload.categoryContext.categoryName).toBe('Giải trí');
    expect(payload.categoryContext.monthlyLimit).toBeNull();
    expect(payload.fallbackText).toBe('Không có hạn mức thiết lập cho danh mục Giải trí.');
  });
});
