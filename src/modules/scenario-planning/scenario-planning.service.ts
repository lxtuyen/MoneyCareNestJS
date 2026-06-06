import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ok } from 'src/common/utils/response.util';
import { Transaction } from 'src/modules/transactions/entities/transaction.entity';
import { PersonalizationService } from 'src/modules/personalization/personalization.service';
import { SpendingPlansService } from 'src/modules/spending-plans/spending-plans.service';
import { GoalAchievementPredictionDto } from 'src/modules/saving-goals/dto/goal-achievement-prediction.dto';
import {
  GoalAchievementPredictionService,
  GoalPredictionOverrides,
} from 'src/modules/saving-goals/goal-achievement-prediction.service';
import { User } from 'src/modules/user/entities/user.entity';
import { getVietnamNow } from 'src/common/utils/date.util';
import {
  ScenarioBudgetRisk,
  ScenarioGoalImpactDto,
  ScenarioRecommendedActionDto,
  ScenarioSimulationResponseDto,
  ScenarioTemplateDto,
} from './dto/scenario-simulation-response.dto';
import { ScenarioType, SimulateScenarioDto } from './dto/simulate-scenario.dto';
import { ScenarioSimulation } from './entities/scenario-simulation.entity';
import {
  calculateCategoryReduction,
  calculateFrequencyReduction,
  calculateIncomeDrop,
  calculateOneTimePurchase,
  emptyDelta,
  optionalNumber,
  requireText,
  resolveBudgetRisk,
  roundMoney,
  ScenarioDelta,
  toNumber,
} from './utils/scenario-calculation.util';

type SavingCapacity = Awaited<
  ReturnType<SpendingPlansService['getMonthlySavingCapacity']>
>;

interface BaselineState {
  monthlyIncome: number;
  monthlyExpenseForecast: number;
  monthlySavingsForecast: number;
  budgetRisk: ScenarioBudgetRisk;
  profileRisk: string | null;
  profileConfidence: number;
  activeMonths: number;
  transactionCount: number;
  categoryMonthlyAverages: Record<string, number>;
  topExpenseCategories: Array<{ name: string; amount: number }>;
  recurringExpenseHints: unknown[];
  capacity: SavingCapacity;
}

interface BuiltScenario {
  delta: ScenarioDelta;
  title: string;
  summary: string;
  confidenceAdjustment: number;
  recommendedActions: ScenarioRecommendedActionDto[];
  goalOverrides: GoalPredictionOverrides;
}

@Injectable()
export class ScenarioPlanningService {
  private readonly logger = new Logger(ScenarioPlanningService.name);

  constructor(
    @InjectRepository(ScenarioSimulation)
    private readonly scenarioRepo: Repository<ScenarioSimulation>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    private readonly personalizationService: PersonalizationService,
    private readonly spendingPlansService: SpendingPlansService,
    private readonly goalPredictionService: GoalAchievementPredictionService,
  ) {}

  async simulate(userId: number, dto: SimulateScenarioDto) {
    const baseline = await this.buildBaseline(userId);
    const scenario = await this.buildScenario(dto, baseline);
    const goalImpacts = await this.buildGoalImpacts(
      userId,
      dto,
      scenario.goalOverrides,
    );

    const monthlyIncomeAfter =
      baseline.monthlyIncome + scenario.delta.monthlyIncomeChange;
    const monthlyExpenseAfter =
      baseline.monthlyExpenseForecast + scenario.delta.monthlyExpenseChange;
    const expectedSavingsAfter =
      baseline.monthlySavingsForecast + scenario.delta.monthlySaving;
    const budgetRiskAfter = resolveBudgetRisk({
      monthlyIncome: monthlyIncomeAfter,
      monthlyExpense: monthlyExpenseAfter,
      planLimit: baseline.capacity?.totalAmount,
      fallbackRisk: baseline.budgetRisk,
    });

    const reasonCodes = this.mergeReasonCodes([
      scenario.delta.reasonCodes,
      this.buildRiskReasonCodes(baseline.budgetRisk, budgetRiskAfter),
      this.buildGoalReasonCodes(goalImpacts),
    ]);

    const response: ScenarioSimulationResponseDto = {
      scenarioId: this.createScenarioId(),
      scenarioType: dto.scenarioType,
      title: scenario.title,
      summary: scenario.summary,
      monthlySaving: roundMoney(scenario.delta.monthlySaving),
      monthlyExpenseChange: roundMoney(scenario.delta.monthlyExpenseChange),
      monthlyIncomeChange: roundMoney(scenario.delta.monthlyIncomeChange),
      expectedSavingsAfter: roundMoney(expectedSavingsAfter),
      budgetRiskBefore: baseline.budgetRisk,
      budgetRiskAfter,
      goalImpacts,
      recommendedActions: scenario.recommendedActions,
      confidence: this.calculateConfidence(baseline, scenario),
      reasonCodes,
      supportingData: {
        baselineMonthlyIncome: roundMoney(baseline.monthlyIncome),
        baselineMonthlyExpense: roundMoney(baseline.monthlyExpenseForecast),
        baselineMonthlySaving: roundMoney(baseline.monthlySavingsForecast),
        newMonthlyIncome: roundMoney(monthlyIncomeAfter),
        newMonthlyExpense: roundMoney(monthlyExpenseAfter),
        newMonthlySaving: roundMoney(expectedSavingsAfter),
        categoryDeltas: scenario.delta.categoryDeltas,
        oneTimeCashOutflow: scenario.delta.oneTimeCashOutflow,
        activeMonths: Math.round(baseline.activeMonths * 10) / 10,
        transactionCount: baseline.transactionCount,
      },
      createdAt: new Date().toISOString(),
    };

    await this.saveSimulation(userId, dto, response);
    return ok(response, 'Mô phỏng kịch bản thành công');
  }

  async getTemplates() {
    return ok(
      { items: this.buildTemplates() },
      'Lấy danh sách kịch bản mô phỏng thành công',
    );
  }

  async getHistory(userId: number) {
    const items = await this.scenarioRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    return ok(
      items.map((item) => ({
        id: item.id,
        scenarioType: item.scenarioType,
        inputPayload: item.inputPayload,
        resultPayload: item.resultPayload,
        createdAt: item.createdAt,
      })),
      'Lấy lịch sử mô phỏng thành công',
    );
  }

  private async buildBaseline(userId: number): Promise<BaselineState> {
    const periodStart = getVietnamNow();
    periodStart.setDate(periodStart.getDate() - 180);

    const [transactions, profile, capacity] = await Promise.all([
      this.transactionRepo
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.category', 'category')
        .where('t.userId = :userId', { userId })
        .andWhere('t.isTransfer = :isTransfer', { isTransfer: false })
        .andWhere('t.transaction_date >= :periodStart', { periodStart })
        .orderBy('t.transaction_date', 'ASC')
        .getMany(),
      this.personalizationService.getOrBuildProfile(userId).catch((error) => {
        this.logger.warn(`Cannot load personal profile: ${error.message}`);
        return null;
      }),
      this.spendingPlansService
        .getMonthlySavingCapacity(userId)
        .catch((error) => {
          this.logger.warn(`Cannot load spending capacity: ${error.message}`);
          return null;
        }),
    ]);

    const simpleAverages = this.calculateSimpleAverages(transactions);
    const monthlyIncome = roundMoney(
      Number(profile?.averageMonthlyIncome ?? simpleAverages.monthlyIncome),
    );
    const profileExpense = Number(
      profile?.averageMonthlyExpense ?? simpleAverages.monthlyExpense,
    );
    const monthlyExpenseForecast = roundMoney(
      capacity?.fixedExpenseTotal && capacity.fixedExpenseTotal > 0
        ? capacity.fixedExpenseTotal
        : profileExpense,
    );
    const monthlySavingsForecast = roundMoney(
      profile?.averageMonthlySavings !== undefined
        ? Number(profile.averageMonthlySavings)
        : monthlyIncome - monthlyExpenseForecast,
    );
    const categoryMonthlyAverages = this.calculateCategoryMonthlyAverages(
      transactions,
      simpleAverages.activeMonths,
    );
    const topExpenseCategories = this.extractTopExpenseCategories(
      profile?.topExpenseCategories,
      categoryMonthlyAverages,
    );
    const budgetRisk = resolveBudgetRisk({
      monthlyIncome,
      monthlyExpense: monthlyExpenseForecast,
      planLimit: capacity?.totalAmount,
      fallbackRisk: profile?.riskLevel,
    });

    return {
      monthlyIncome,
      monthlyExpenseForecast,
      monthlySavingsForecast,
      budgetRisk,
      profileRisk: profile?.riskLevel ?? null,
      profileConfidence: Number(profile?.confidenceScore ?? 0),
      activeMonths: simpleAverages.activeMonths,
      transactionCount: transactions.length,
      categoryMonthlyAverages,
      topExpenseCategories,
      recurringExpenseHints: profile?.recurringExpenseHints ?? [],
      capacity,
    };
  }

  private async buildScenario(
    dto: SimulateScenarioDto,
    baseline: BaselineState,
  ): Promise<BuiltScenario> {
    switch (dto.scenarioType) {
      case 'reduce_frequency_expense':
        return this.buildReduceFrequencyScenario(dto, baseline);
      case 'reduce_category_spending':
        return this.buildReduceCategoryScenario(dto, baseline);
      case 'income_drop':
        return this.buildIncomeDropScenario(dto, baseline);
      case 'one_time_purchase':
        return this.buildOneTimePurchaseScenario(dto);
      case 'increase_saving_goal':
        return this.buildIncreaseSavingGoalScenario(dto);
      case 'extend_goal_deadline':
        return this.buildExtendGoalDeadlineScenario(dto);
    }
  }

  private buildReduceFrequencyScenario(
    dto: SimulateScenarioDto,
    baseline: BaselineState,
  ): BuiltScenario {
    const params = dto.params;
    const itemName = requireText(params.itemName, 'itemName');
    const averageAmountInput = optionalNumber(params.averageAmount);
    const estimatedAmount =
      averageAmountInput ?? this.estimateAverageAmount(itemName, baseline);
    const delta = calculateFrequencyReduction({
      itemName,
      currentFrequencyPerWeek: toNumber(params.currentFrequencyPerWeek),
      newFrequencyPerWeek: toNumber(params.newFrequencyPerWeek),
      averageAmount: estimatedAmount,
    });
    if (averageAmountInput === undefined) {
      delta.reasonCodes.push('average_amount_estimated_from_history');
    }

    return {
      delta,
      title: `Giảm ${itemName}`,
      summary: `Bạn có thể tiết kiệm khoảng ${roundMoney(delta.monthlySaving).toLocaleString('vi-VN')} VND/tháng.`,
      confidenceAdjustment: averageAmountInput === undefined ? -0.07 : 0.04,
      recommendedActions: [
        {
          actionType: 'reduce_frequency',
          amount: roundMoney(delta.monthlySaving),
          message: `Giảm ${itemName} theo tần suất mới để tăng tiết kiệm hàng tháng.`,
          priority: 'medium',
        },
      ],
      goalOverrides: { monthlySavingDelta: delta.monthlySaving },
    };
  }

  private buildReduceCategoryScenario(
    dto: SimulateScenarioDto,
    baseline: BaselineState,
  ): BuiltScenario {
    const categoryName = requireText(dto.params.categoryName, 'categoryName');
    const reductionAmount = toNumber(dto.params.monthlyReductionAmount);
    const delta = calculateCategoryReduction({
      categoryName,
      monthlyReductionAmount: reductionAmount,
    });
    const categoryBaseline =
      baseline.categoryMonthlyAverages[categoryName.toLowerCase()] ?? 0;
    if (categoryBaseline > 0 && reductionAmount > categoryBaseline) {
      delta.reasonCodes.push('category_reduction_too_high');
    }

    return {
      delta,
      title: `Giảm chi tiêu ${categoryName}`,
      summary: `Giảm ${categoryName} khoảng ${roundMoney(reductionAmount).toLocaleString('vi-VN')} VND/tháng có thể tăng tiết kiệm tương ứng.`,
      confidenceAdjustment: categoryBaseline > 0 ? 0.04 : -0.03,
      recommendedActions: [
        {
          actionType: 'reduce_category',
          categoryName,
          amount: roundMoney(reductionAmount),
          message: `Theo dõi ${categoryName} và đặt mức giảm ${roundMoney(reductionAmount).toLocaleString('vi-VN')} VND/tháng.`,
          priority:
            categoryBaseline > 0 && reductionAmount > categoryBaseline
              ? 'high'
              : 'medium',
        },
      ],
      goalOverrides: { monthlySavingDelta: delta.monthlySaving },
    };
  }

  private buildIncomeDropScenario(
    dto: SimulateScenarioDto,
    baseline: BaselineState,
  ): BuiltScenario {
    const delta = calculateIncomeDrop({
      monthlyIncome: baseline.monthlyIncome,
      incomeDropPct: optionalNumber(dto.params.incomeDropPct),
      incomeDropAmount: optionalNumber(dto.params.incomeDropAmount),
    });
    const gap = Math.max(
      0,
      baseline.monthlyExpenseForecast -
        (baseline.monthlyIncome + delta.monthlyIncomeChange),
    );
    const recommendedActions = this.buildCutRecommendations(
      baseline,
      Math.max(gap, Math.abs(delta.monthlyIncomeChange) * 0.4),
    );

    return {
      delta,
      title: 'Thu nhập giảm',
      summary: `Thu nhập giảm làm khả năng tiết kiệm thay đổi ${roundMoney(delta.monthlySaving).toLocaleString('vi-VN')} VND/tháng.`,
      confidenceAdjustment: baseline.monthlyIncome > 0 ? 0.02 : -0.08,
      recommendedActions,
      goalOverrides: { monthlySavingDelta: delta.monthlySaving },
    };
  }

  private buildOneTimePurchaseScenario(
    dto: SimulateScenarioDto,
  ): BuiltScenario {
    const amount = toNumber(dto.params.amount);
    const categoryName =
      typeof dto.params.categoryName === 'string'
        ? dto.params.categoryName
        : undefined;
    const delta = calculateOneTimePurchase({ amount, categoryName });

    return {
      delta,
      title: 'Mua một khoản lớn',
      summary: `Khoản chi một lần ${roundMoney(amount).toLocaleString('vi-VN')} VND sẽ làm giảm dòng tiền tháng này.`,
      confidenceAdjustment: 0.04,
      recommendedActions: [
        {
          actionType: 'pause_discretionary_spending',
          categoryName,
          amount: roundMoney(amount),
          message:
            'Cân nhắc bù lại khoản chi này bằng cách giảm các khoản linh hoạt trong vài tháng tới.',
          priority: 'high',
        },
      ],
      goalOverrides: {
        monthlySavingDelta: delta.monthlySaving,
        oneTimeOutflow: delta.oneTimeCashOutflow,
      },
    };
  }

  private buildIncreaseSavingGoalScenario(
    dto: SimulateScenarioDto,
  ): BuiltScenario {
    const newTargetAmount = toNumber(dto.params.newTargetAmount);
    if (newTargetAmount <= 0) {
      requireText('', 'newTargetAmount');
    }
    const delta = emptyDelta();
    delta.reasonCodes.push('saving_goal_target_increased');

    return {
      delta,
      title: 'Tăng mục tiêu tiết kiệm',
      summary: `Mục tiêu mới là ${roundMoney(newTargetAmount).toLocaleString('vi-VN')} VND.`,
      confidenceAdjustment: 0.01,
      recommendedActions: [
        {
          actionType: 'increase_monthly_saving',
          amount: 0,
          message:
            'So sánh ngày hoàn thành mới để quyết định mức tăng tiết kiệm hàng tháng.',
          priority: 'medium',
        },
      ],
      goalOverrides: { newTargetAmount },
    };
  }

  private buildExtendGoalDeadlineScenario(
    dto: SimulateScenarioDto,
  ): BuiltScenario {
    const newDeadlineText = requireText(dto.params.newDeadline, 'newDeadline');
    const newDeadline = new Date(newDeadlineText);
    if (Number.isNaN(newDeadline.getTime())) {
      requireText('', 'newDeadline');
    }
    const delta = emptyDelta();
    delta.reasonCodes.push('deadline_extension_reduces_pressure');

    return {
      delta,
      title: 'Dời hạn mục tiêu',
      summary: `Hạn mới ${newDeadlineText} giúp giảm áp lực tiết kiệm hàng tháng.`,
      confidenceAdjustment: 0.01,
      recommendedActions: [
        {
          actionType: 'extend_deadline',
          message: `Dời hạn sang ${newDeadlineText} nếu muốn giảm áp lực ngân sách.`,
          priority: 'low',
        },
      ],
      goalOverrides: { newDeadline },
    };
  }

  private async buildGoalImpacts(
    userId: number,
    dto: SimulateScenarioDto,
    overrides: GoalPredictionOverrides,
  ): Promise<ScenarioGoalImpactDto[]> {
    const goalIds = await this.resolveGoalIds(userId, dto);
    const impacts: ScenarioGoalImpactDto[] = [];

    for (const goalId of goalIds) {
      try {
        const [current, adjusted] = await Promise.all([
          this.goalPredictionService.predictGoal(userId, goalId),
          this.goalPredictionService.predictGoalWithOverrides(
            userId,
            goalId,
            overrides,
          ),
        ]);
        impacts.push(this.mapGoalImpact(current, adjusted));
      } catch (error) {
        this.logger.warn(`Cannot simulate goal ${goalId}: ${error.message}`);
      }
    }

    return impacts;
  }

  private async resolveGoalIds(
    userId: number,
    dto: SimulateScenarioDto,
  ): Promise<number[]> {
    if (dto.goalIds?.length) return Array.from(new Set(dto.goalIds));

    const goalIdFromParams = optionalNumber(dto.params.goalId);
    if (goalIdFromParams) return [goalIdFromParams];

    try {
      const summary = await this.goalPredictionService.predictAllGoals(userId);
      return summary.predictions.map((item) => item.goalId);
    } catch (error) {
      this.logger.warn(`Cannot resolve active goals: ${error.message}`);
      return [];
    }
  }

  private mapGoalImpact(
    current: GoalAchievementPredictionDto,
    adjusted: GoalAchievementPredictionDto,
  ): ScenarioGoalImpactDto {
    const currentDate = this.parseDate(current.predictedCompletionDate);
    const newDate = this.parseDate(adjusted.predictedCompletionDate);
    const impactDays =
      currentDate && newDate
        ? Math.round(
            (newDate.getTime() - currentDate.getTime()) / (24 * 60 * 60 * 1000),
          )
        : null;

    return {
      goalId: current.goalId,
      goalName: current.name,
      currentPredictedCompletionDate: current.predictedCompletionDate,
      newPredictedCompletionDate: adjusted.predictedCompletionDate,
      impactDays,
      impactText: this.buildImpactText(impactDays),
    };
  }

  private buildImpactText(impactDays: number | null): string {
    if (impactDays === null) {
      return 'Chưa đủ dữ liệu để ước tính thay đổi ngày hoàn thành.';
    }
    if (impactDays < 0) {
      return `Mục tiêu có thể hoàn thành sớm hơn ${Math.abs(impactDays)} ngày.`;
    }
    if (impactDays > 0) {
      return `Mục tiêu có thể trễ hơn ${impactDays} ngày.`;
    }
    return 'Ngày hoàn thành mục tiêu gần như không đổi.';
  }

  private buildCutRecommendations(
    baseline: BaselineState,
    targetAmount: number,
  ): ScenarioRecommendedActionDto[] {
    const categories = baseline.topExpenseCategories.slice(0, 3);
    if (categories.length === 0) {
      return [
        {
          actionType: 'review_budget',
          message:
            'Rà lại các khoản chi linh hoạt để bù phần thu nhập bị giảm.',
          priority: 'high',
        },
      ];
    }

    return categories.map((category, index) => {
      const amount = roundMoney(
        Math.max(100000, Math.min(category.amount * 0.2, targetAmount / 2)),
      );
      return {
        actionType: 'reduce_category',
        categoryName: category.name,
        amount,
        message: `Giảm ${category.name} khoảng ${amount.toLocaleString('vi-VN')} VND/tháng để giữ ngân sách ổn định.`,
        priority: index === 0 ? 'high' : 'medium',
      };
    });
  }

  private calculateConfidence(
    baseline: BaselineState,
    scenario: BuiltScenario,
  ): number {
    let confidence = 0.45;
    if (baseline.transactionCount >= 20) confidence += 0.1;
    if (baseline.activeMonths >= 3) confidence += 0.08;
    if (baseline.capacity) confidence += 0.07;
    if (baseline.profileConfidence > 0) {
      confidence = confidence * 0.6 + (baseline.profileConfidence / 100) * 0.4;
    }
    confidence += scenario.confidenceAdjustment;

    return Math.max(0.25, Math.min(0.95, Math.round(confidence * 100) / 100));
  }

  private buildRiskReasonCodes(
    before: ScenarioBudgetRisk,
    after: ScenarioBudgetRisk,
  ): string[] {
    const score: Record<ScenarioBudgetRisk, number> = {
      low: 1,
      medium: 2,
      high: 3,
    };
    if (score[after] > score[before]) return ['budget_risk_increased'];
    if (score[after] < score[before]) return ['budget_risk_reduced'];
    return [];
  }

  private buildGoalReasonCodes(impacts: ScenarioGoalImpactDto[]): string[] {
    const codes = new Set<string>();
    for (const impact of impacts) {
      if (impact.impactDays === null) continue;
      if (impact.impactDays < 0) codes.add('goal_completion_earlier');
      if (impact.impactDays > 0) codes.add('goal_completion_delayed');
    }
    return Array.from(codes);
  }

  private mergeReasonCodes(groups: string[][]): string[] {
    return Array.from(new Set(groups.flat().filter(Boolean)));
  }

  private calculateSimpleAverages(transactions: Transaction[]) {
    const activeMonths = this.calculateActiveMonths(transactions);
    const income = transactions
      .filter((transaction) => transaction.type === 'income')
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
    const expense = transactions
      .filter((transaction) => transaction.type === 'expense')
      .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);

    return {
      monthlyIncome: activeMonths > 0 ? income / activeMonths : 0,
      monthlyExpense: activeMonths > 0 ? expense / activeMonths : 0,
      activeMonths,
    };
  }

  private calculateCategoryMonthlyAverages(
    transactions: Transaction[],
    activeMonths: number,
  ): Record<string, number> {
    const totals: Record<string, number> = {};
    for (const transaction of transactions) {
      if (transaction.type !== 'expense') continue;
      const name = transaction.category?.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      totals[key] = (totals[key] ?? 0) + Number(transaction.amount ?? 0);
    }

    return Object.fromEntries(
      Object.entries(totals).map(([key, value]) => [
        key,
        roundMoney(value / Math.max(1, activeMonths)),
      ]),
    );
  }

  private extractTopExpenseCategories(
    profileCategories: unknown,
    categoryMonthlyAverages: Record<string, number>,
  ): Array<{ name: string; amount: number }> {
    if (Array.isArray(profileCategories) && profileCategories.length > 0) {
      return profileCategories
        .map((item: any) => ({
          name: String(item.name ?? item.categoryName ?? ''),
          amount: Number(item.amount ?? 0),
        }))
        .filter((item) => item.name && item.amount > 0)
        .slice(0, 5);
    }

    return Object.entries(categoryMonthlyAverages)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }

  private estimateAverageAmount(
    itemName: string,
    baseline: BaselineState,
  ): number {
    const hint = baseline.recurringExpenseHints.find((item: any) => {
      const categoryName = String(item?.categoryName ?? '').toLowerCase();
      return categoryName.includes(itemName.toLowerCase());
    }) as any;
    const estimated = Number(hint?.estimatedAmount ?? 0);
    if (estimated > 0) return estimated;
    return 50000;
  }

  private calculateActiveMonths(transactions: Transaction[]): number {
    if (transactions.length === 0) return 0;
    const timestamps = transactions
      .map((transaction) => transaction.transaction_date?.getTime())
      .filter((value): value is number => typeof value === 'number');
    if (timestamps.length === 0) return 1;

    const first = Math.min(...timestamps);
    const last = Math.max(...timestamps, getVietnamNow().getTime());
    const days = Math.max(
      1,
      Math.ceil((last - first) / (24 * 60 * 60 * 1000)) + 1,
    );
    return Math.max(1, days / 30.4);
  }

  private parseDate(value: string | null): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private createScenarioId(): string {
    return `sim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async saveSimulation(
    userId: number,
    dto: SimulateScenarioDto,
    response: ScenarioSimulationResponseDto,
  ) {
    const simulation = this.scenarioRepo.create({
      user: { id: userId } as User,
      scenarioType: dto.scenarioType,
      inputPayload: dto as unknown as Record<string, unknown>,
      resultPayload: response as unknown as Record<string, unknown>,
    });
    await this.scenarioRepo.save(simulation);
  }

  private buildTemplates(): ScenarioTemplateDto[] {
    return [
      {
        scenarioType: 'reduce_frequency_expense',
        title: 'Giảm tần suất chi tiêu',
        description: 'Ước tính khoản tiết kiệm khi giảm một thói quen lặp lại.',
        fields: [
          {
            name: 'itemName',
            type: 'text',
            label: 'Khoản chi',
            required: true,
          },
          {
            name: 'currentFrequencyPerWeek',
            type: 'number',
            label: 'Tần suất hiện tại mỗi tuần',
            required: true,
          },
          {
            name: 'newFrequencyPerWeek',
            type: 'number',
            label: 'Tần suất mới mỗi tuần',
            required: true,
          },
          {
            name: 'averageAmount',
            type: 'money',
            label: 'Số tiền mỗi lần',
            required: true,
          },
        ],
      },
      {
        scenarioType: 'reduce_category_spending',
        title: 'Giảm chi tiêu danh mục',
        description: 'Thử giảm một danh mục để xem tác động đến tiết kiệm.',
        fields: [
          {
            name: 'categoryName',
            type: 'text',
            label: 'Danh mục',
            required: true,
          },
          {
            name: 'monthlyReductionAmount',
            type: 'money',
            label: 'Số tiền giảm mỗi tháng',
            required: true,
          },
        ],
      },
      {
        scenarioType: 'income_drop',
        title: 'Thu nhập giảm',
        description: 'Đánh giá ngân sách khi thu nhập giảm theo phần trăm.',
        fields: [
          {
            name: 'incomeDropPct',
            type: 'percent',
            label: 'Phần trăm giảm',
            required: true,
          },
        ],
      },
      {
        scenarioType: 'one_time_purchase',
        title: 'Mua một khoản lớn',
        description: 'Xem khoản chi một lần ảnh hưởng thế nào đến mục tiêu.',
        fields: [
          { name: 'amount', type: 'money', label: 'Số tiền', required: true },
          {
            name: 'categoryName',
            type: 'text',
            label: 'Danh mục',
            required: false,
          },
        ],
      },
      {
        scenarioType: 'increase_saving_goal',
        title: 'Tăng mục tiêu tiết kiệm',
        description: 'Tính lại tiến độ nếu nâng số tiền mục tiêu.',
        fields: [
          { name: 'goalId', type: 'number', label: 'Mục tiêu', required: true },
          {
            name: 'newTargetAmount',
            type: 'money',
            label: 'Số tiền mục tiêu mới',
            required: true,
          },
        ],
      },
      {
        scenarioType: 'extend_goal_deadline',
        title: 'Dời hạn mục tiêu',
        description: 'Tính lại áp lực tiết kiệm khi đổi hạn.',
        fields: [
          { name: 'goalId', type: 'number', label: 'Mục tiêu', required: true },
          {
            name: 'newDeadline',
            type: 'date',
            label: 'Hạn mới',
            required: true,
          },
        ],
      },
    ];
  }
}
