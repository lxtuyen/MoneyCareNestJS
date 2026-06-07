import { Injectable, Logger } from '@nestjs/common';
import { ok } from 'src/common/utils/response.util';
import { ApiResponse } from 'src/common/dto/api-response.dto';
import { norm } from 'src/common/utils/string.util';
import { ScenarioPlanningService } from 'src/modules/scenario-planning/scenario-planning.service';
import { SimulateScenarioDto } from 'src/modules/scenario-planning/dto/simulate-scenario.dto';
import { ScenarioSimulationResponseDto } from 'src/modules/scenario-planning/dto/scenario-simulation-response.dto';
import { AiGeminiClientService } from './ai-gemini-client.service';
import {
  GeminiResponse,
  getWhatIfScenarioPrompt,
  getWhatIfScenarioTool,
} from './config/gemini-tools.config';

type ParsedWhatIfScenario = {
  scenarioType:
    | 'one_time_purchase'
    | 'reduce_frequency_expense'
    | 'reduce_category_spending'
    | 'income_drop';
  itemName?: string | null;
  categoryName?: string | null;
  amount?: number | null;
  monthlyReductionAmount?: number | null;
  incomeDropPct?: number | null;
  currentFrequencyPerWeek?: number | null;
  newFrequencyPerWeek?: number | null;
  averageAmount?: number | null;
  needsAmount?: boolean;
};

@Injectable()
export class AiScenarioWhatIfChatService {
  private readonly logger = new Logger(AiScenarioWhatIfChatService.name);

  constructor(
    private readonly scenarioPlanningService: ScenarioPlanningService,
    private readonly geminiClient: AiGeminiClientService,
  ) {}

  isWhatIfRequest(message: string): boolean {
    const normalized = norm(message || '');
    if (!normalized) return false;

    const hasWhatIfSignal =
      normalized.includes('neu') ||
      normalized.includes('gia su') ||
      normalized.includes('what if') ||
      normalized.includes('thi sao') ||
      normalized.includes('anh huong') ||
      normalized.includes('mo phong');

    const hasAdvisorySpendSignal =
      normalized.includes('co nen') &&
      /(an|mua|di|uong|choi|chi|xem|dat|tra)\b/.test(normalized);

    return hasWhatIfSignal || hasAdvisorySpendSignal;
  }

  async handleWhatIf(
    message: string,
    userId: number,
    goalId?: number,
  ): Promise<ApiResponse<string>> {
    const parsed = await this.parseScenario(message);
    if (parsed.needsAmount || !this.hasRequiredInput(parsed)) {
      return ok(
        '',
        'Bạn muốn mô phỏng khoảng bao nhiêu tiền? Ví dụ: "Haidilao 100k thì sao" hoặc "mua áo 350k thì sao".',
      );
    }

    const dto = this.toSimulateDto(parsed, goalId);
    const result = await this.scenarioPlanningService.simulate(userId, dto);
    const fallbackText = this.formatScenarioAnswer(result.data, parsed, goalId);
    const payload = this.buildSimulationPayload(
      result.data,
      parsed,
      goalId,
      fallbackText,
    );
    return ok('', `__SCENARIO_SIMULATION__${JSON.stringify(payload)}`);
  }

  async parseScenario(message: string): Promise<ParsedWhatIfScenario> {
    const fallback = this.parseScenarioFallback(message);
    if (fallback && this.hasRequiredInput(fallback)) return fallback;
    if (fallback?.needsAmount) return fallback;

    try {
      const prompt = getWhatIfScenarioPrompt(message, new Date().toISOString());
      const response = await this.geminiClient.generateToolContent(
        prompt,
        getWhatIfScenarioTool(),
      );
      const calls = (response as unknown as GeminiResponse).functionCalls;
      const args = calls?.[0]?.args;
      if (!args) throw new Error('Khong nhan duoc function call');

      const parsed = this.normalizeParsedScenario(args);
      if (this.hasRequiredInput(parsed) || parsed.needsAmount) return parsed;
    } catch (error) {
      this.logger.warn(`Cannot parse what-if with Gemini: ${error.message}`);
    }

    return (
      fallback ?? {
        scenarioType: 'one_time_purchase',
        needsAmount: true,
      }
    );
  }

  private parseScenarioFallback(message: string): ParsedWhatIfScenario | null {
    const normalized = norm(message || '');
    if (!normalized) return null;

    const incomeDropPct = this.extractPercentage(normalized);
    if (
      incomeDropPct !== null &&
      (normalized.includes('luong') || normalized.includes('thu nhap'))
    ) {
      return {
        scenarioType: 'income_drop',
        incomeDropPct,
      };
    }

    const frequency = this.parseFrequencyReduction(normalized, message);
    if (frequency) return frequency;

    const categoryReduction = this.parseCategoryReduction(normalized, message);
    if (categoryReduction) return categoryReduction;

    const amount = this.extractMoney(message);
    if (amount !== null) {
      const itemName = this.extractSpendingLabel(message);
      return {
        scenarioType: 'one_time_purchase',
        amount,
        itemName,
        categoryName: this.inferCategoryName(normalized, itemName),
      };
    }

    if (this.isWhatIfRequest(message)) {
      const itemName = this.extractSpendingLabel(message);
      return {
        scenarioType: 'one_time_purchase',
        itemName,
        categoryName: this.inferCategoryName(normalized, itemName),
        needsAmount: true,
      };
    }

    return null;
  }

  private parseFrequencyReduction(
    normalized: string,
    original: string,
  ): ParsedWhatIfScenario | null {
    if (!normalized.includes('giam')) return null;
    const match = normalized.match(
      /giam\s+(.+?)\s+tu\s+(\d+(?:[.,]\d+)?)\s+\S*(?:\/tuan|tuan)?\s+(?:xuong|con)\s+(\d+(?:[.,]\d+)?)/,
    );
    if (!match) return null;

    const averageAmount = this.extractMoney(original);
    return {
      scenarioType: 'reduce_frequency_expense',
      itemName: this.cleanLabel(match[1]) || 'khoản chi',
      currentFrequencyPerWeek: Number(match[2].replace(',', '.')),
      newFrequencyPerWeek: Number(match[3].replace(',', '.')),
      averageAmount,
      needsAmount: averageAmount === null,
    };
  }

  private parseCategoryReduction(
    normalized: string,
    original: string,
  ): ParsedWhatIfScenario | null {
    if (!normalized.includes('giam')) return null;
    if (normalized.includes('tu ') && normalized.includes('xuong')) return null;

    const amount = this.extractMoney(original);
    if (amount === null) return null;

    const match = normalized.match(/giam\s+(.+?)\s+\d/);
    const categoryName = match ? this.cleanLabel(match[1]) : 'chi tiêu';
    return {
      scenarioType: 'reduce_category_spending',
      categoryName,
      monthlyReductionAmount: amount,
    };
  }

  private normalizeParsedScenario(
    args: Record<string, unknown>,
  ): ParsedWhatIfScenario {
    return {
      scenarioType:
        (args.scenarioType as ParsedWhatIfScenario['scenarioType']) ??
        'one_time_purchase',
      itemName: this.toOptionalString(args.itemName),
      categoryName: this.toOptionalString(args.categoryName),
      amount: this.toOptionalNumber(args.amount),
      monthlyReductionAmount: this.toOptionalNumber(
        args.monthlyReductionAmount,
      ),
      incomeDropPct: this.toOptionalNumber(args.incomeDropPct),
      currentFrequencyPerWeek: this.toOptionalNumber(
        args.currentFrequencyPerWeek,
      ),
      newFrequencyPerWeek: this.toOptionalNumber(args.newFrequencyPerWeek),
      averageAmount: this.toOptionalNumber(args.averageAmount),
      needsAmount: args.needsAmount === true,
    };
  }

  private hasRequiredInput(parsed: ParsedWhatIfScenario): boolean {
    switch (parsed.scenarioType) {
      case 'income_drop':
        return Number(parsed.incomeDropPct ?? 0) > 0;
      case 'reduce_frequency_expense':
        return (
          Number(parsed.currentFrequencyPerWeek ?? 0) >=
            Number(parsed.newFrequencyPerWeek ?? 0) &&
          Number(parsed.currentFrequencyPerWeek ?? 0) > 0 &&
          Number(parsed.averageAmount ?? 0) > 0
        );
      case 'reduce_category_spending':
        return Number(parsed.monthlyReductionAmount ?? 0) > 0;
      case 'one_time_purchase':
        return Number(parsed.amount ?? 0) > 0;
    }
  }

  private toSimulateDto(
    parsed: ParsedWhatIfScenario,
    goalId?: number,
  ): SimulateScenarioDto {
    const params: Record<string, unknown> = {};
    if (parsed.scenarioType === 'one_time_purchase') {
      params.amount = parsed.amount;
      params.categoryName =
        parsed.categoryName ||
        this.inferCategoryName(norm(parsed.itemName || ''), parsed.itemName) ||
        'Chi tiêu phát sinh';
    } else if (parsed.scenarioType === 'income_drop') {
      params.incomeDropPct = parsed.incomeDropPct;
    } else if (parsed.scenarioType === 'reduce_frequency_expense') {
      params.itemName = parsed.itemName || parsed.categoryName || 'khoản chi';
      params.currentFrequencyPerWeek = parsed.currentFrequencyPerWeek;
      params.newFrequencyPerWeek = parsed.newFrequencyPerWeek;
      params.averageAmount = parsed.averageAmount;
    } else {
      params.categoryName =
        parsed.categoryName || parsed.itemName || 'chi tiêu';
      params.monthlyReductionAmount = parsed.monthlyReductionAmount;
    }

    return {
      scenarioType: parsed.scenarioType,
      params,
      goalIds: goalId && goalId > 0 ? [goalId] : undefined,
    };
  }

  private formatScenarioAnswer(
    result: ScenarioSimulationResponseDto | undefined,
    parsed: ParsedWhatIfScenario,
    goalId?: number,
  ): string {
    if (!result) {
      return 'Mình chưa mô phỏng được kịch bản này. Bạn thử nói rõ số tiền hoặc phần trăm thay đổi nhé.';
    }

    const lines = [this.buildCategoryLine(result, parsed)];

    let goalImpact = result.goalImpacts.find(
      (impact) =>
        goalId !== undefined && goalId > 0 && impact.goalId === goalId,
    );
    if (!goalImpact) {
      goalImpact = result.goalImpacts[0];
    }

    if (goalImpact) {
      const name = goalImpact.goalName;
      const statusBefore = this.goalStatusText(
        goalImpact.currentStatus || 'on_track',
      );
      const statusAfter = this.goalStatusText(
        goalImpact.newStatus || 'on_track',
      );

      const dateBefore = this.formatDateVn(
        goalImpact.currentPredictedCompletionDate,
      );
      const dateAfter = this.formatDateVn(
        goalImpact.newPredictedCompletionDate,
      );

      const rateBefore = this.formatMoney(
        goalImpact.currentMonthlySavingRate || 0,
      );
      const rateAfter = this.formatMoney(goalImpact.newMonthlySavingRate || 0);
      const reqBefore = this.formatMoney(
        goalImpact.requiredMonthlySavingRate || 0,
      );
      const reqAfter = this.formatMoney(
        goalImpact.newRequiredMonthlySavingRate || 0,
      );

      const diffBefore = this.goalDifferenceText(
        goalImpact.currentDaysDifference ?? null,
      );
      const diffAfter = this.goalDifferenceText(
        goalImpact.newDaysDifference ?? null,
      );

      lines.push(`Mục tiêu "${name}": ${statusBefore} -> ${statusAfter}`);
      lines.push(
        `- Dự kiến hoàn thành: ${dateBefore} -> ${dateAfter} (${diffBefore} -> ${diffAfter})`,
      );
      lines.push(
        `- Tốc độ tích lũy: ${rateBefore} -> ${rateAfter}/tháng (Yêu cầu: ${reqBefore} -> ${reqAfter}/tháng)`,
      );
    }

    return lines.filter(Boolean).join('\n');
  }

  private buildMainImpactLine(
    result: ScenarioSimulationResponseDto,
    parsed: ParsedWhatIfScenario,
  ): string {
    if (parsed.scenarioType === 'income_drop') {
      return `Nếu thu nhập giảm ${parsed.incomeDropPct}%, khả năng tiết kiệm mỗi tháng thay đổi khoảng ${this.formatSignedMoney(result.monthlySaving)}.`;
    }

    if (parsed.scenarioType === 'reduce_frequency_expense') {
      return `Nếu bạn giảm ${parsed.itemName || 'khoản chi này'}, tiết kiệm mỗi tháng có thể tăng khoảng ${this.formatMoney(result.monthlySaving)}.`;
    }

    if (parsed.scenarioType === 'reduce_category_spending') {
      return `Nếu bạn giảm ${parsed.categoryName || 'danh mục này'}, tiết kiệm mỗi tháng có thể tăng khoảng ${this.formatMoney(result.monthlySaving)}.`;
    }

    const label = parsed.itemName || parsed.categoryName || 'khoản chi này';
    return `Khoản ${this.formatMoney(Math.abs(result.monthlySaving))} cho ${label} sẽ làm ngân sách tháng này căng hơn.`;
  }

  private buildCashFlowLine(result: ScenarioSimulationResponseDto): string {
    const data = result.supportingData ?? {};
    const baselineSaving = this.numberFrom(data.baselineMonthlySaving);
    const newSaving = this.numberFrom(data.newMonthlySaving);
    const flexibleBefore = this.numberFrom(data.projectedFlexibleBalanceBefore);
    const flexibleAfter = this.numberFrom(data.projectedFlexibleBalanceAfter);

    const savingPart =
      baselineSaving !== null && newSaving !== null
        ? `Tiết kiệm dự kiến còn ${this.formatMoney(newSaving)} so với ${this.formatMoney(baselineSaving)} ban đầu`
        : `Tiết kiệm dự kiến sau kịch bản là ${this.formatMoney(result.expectedSavingsAfter)}`;

    const shouldShowFlexibleBalance =
      flexibleBefore !== null &&
      flexibleAfter !== null &&
      !this.hasConflictingFlexibleForecast(baselineSaving, flexibleBefore);
    const balancePart = shouldShowFlexibleBalance
      ? flexibleAfter >= 0
        ? `; số dư linh hoạt cuối tháng còn khoảng ${this.formatMoney(flexibleAfter)}`
        : `; số dư linh hoạt cuối tháng có thể hụt khoảng ${this.formatMoney(Math.abs(flexibleAfter))}`
      : '';

    return `${savingPart}${balancePart}.`;
  }

  private hasConflictingFlexibleForecast(
    baselineSaving: number | null,
    flexibleBefore: number,
  ): boolean {
    return baselineSaving !== null && baselineSaving >= 0 && flexibleBefore < 0;
  }

  private buildCategoryLine(
    result: ScenarioSimulationResponseDto,
    parsed: ParsedWhatIfScenario,
  ): string {
    const category = this.getCategoryContext(result);
    if (!category) return '';

    const name = String(
      category.categoryName ??
        parsed.categoryName ??
        parsed.itemName ??
        'danh mục này',
    );
    const limit = this.numberFrom(category.monthlyLimit);
    const after = this.numberFrom(category.forecastAfter);
    const average = this.numberFrom(category.monthlyAverage);
    const remainingAfter = this.numberFrom(category.remainingLimitAfter);
    const usagePctAfter = this.numberFrom(category.usagePctAfter);

    if (limit && limit > 0 && after !== null) {
      const remainingText =
        remainingAfter !== null
          ? remainingAfter >= 0
            ? `còn dư khoảng ${this.formatMoney(remainingAfter)}`
            : `vượt khoảng ${this.formatMoney(Math.abs(remainingAfter))}`
          : 'chưa rõ còn dư bao nhiêu';
      return `Nhóm ${name} sau khoản này dự kiến ở mức ${this.formatMoney(after)}/${this.formatMoney(limit)} (${usagePctAfter ?? 0}%), ${remainingText}.`;
    }

    if (average && average > 0) {
      return `Bạn thường chi khoảng ${this.formatMoney(average)}/tháng cho nhóm ${name}; khoản này tương đương khoảng ${Math.round((Math.abs(result.monthlySaving) / average) * 100)}% mức chi trung bình nhóm đó.`;
    }

    return `Không có hạn mức thiết lập cho danh mục ${name}.`;
  }

  private buildPracticalSuggestion(
    result: ScenarioSimulationResponseDto,
    parsed: ParsedWhatIfScenario,
  ): string {
    const category = this.getCategoryContext(result);
    const remainingAfter = this.numberFrom(category?.remainingLimitAfter);
    const limit = this.numberFrom(category?.monthlyLimit);
    const categoryName = String(
      category?.categoryName ?? parsed.categoryName ?? 'nhóm chi này',
    );
    const amount = Math.abs(
      result.monthlySaving || result.monthlyExpenseChange,
    );
    const goalDelay = result.goalImpacts.find(
      (impact) => Number(impact.impactDays ?? 0) > 0,
    );

    if (
      result.budgetRiskAfter === 'high' ||
      (remainingAfter !== null && remainingAfter < 0)
    ) {
      const overAmount =
        remainingAfter !== null && remainingAfter < 0
          ? Math.abs(remainingAfter)
          : amount;
      return `không nên chi nguyên mức này nếu không có khoản bù. Hãy giảm bữa này xuống khoảng ${this.formatMoney(Math.max(0, amount - overAmount))} hoặc cắt lại ${this.formatMoney(overAmount)} ở ${categoryName} trong tháng này.`;
    }

    if (goalDelay && Number(goalDelay.impactDays ?? 0) >= 7) {
      return `nếu vẫn muốn chi, hãy bù lại ${this.formatMoney(amount)} trong 1-2 tuần tới bằng cách giảm một khoản linh hoạt khác; nếu không, mục tiêu "${goalDelay.goalName}" có thể trễ thêm ${goalDelay.impactDays} ngày.`;
    }

    if (limit && remainingAfter !== null && remainingAfter >= amount) {
      return `có thể chấp nhận nếu đây là khoản đã dự tính; sau đó vẫn nên giữ phần còn lại của ${categoryName} dưới ${this.formatMoney(remainingAfter)} đến cuối tháng.`;
    }

    if (result.budgetRiskAfter === 'medium') {
      return `chỉ nên chi nếu đây là ưu tiên thật sự; để tránh rủi ro tăng tiếp, đặt trần ${categoryName} cho các ngày còn lại và bù lại ít nhất ${this.formatMoney(amount)} từ khoản linh hoạt khác.`;
    }

    return `tác động chưa quá căng, nhưng nên coi đây là khoản chi linh hoạt và tránh lặp lại nhiều lần trong tháng nếu bạn muốn giữ tiến độ tiết kiệm.`;
  }

  private extractMoney(text: string): number | null {
    const normalized = norm(text || '');
    const matches = Array.from(
      normalized.matchAll(
        /(\d+(?:[.,]\d+)?)\s*(k|nghin|ngan|trieu|tr|cu|m|vnd|dong)?/g,
      ),
    );
    for (const match of matches) {
      const unit = match[2] ?? '';
      if (!unit) continue;
      const value = Number(match[1].replace(',', '.'));
      if (!Number.isFinite(value) || value <= 0) continue;
      if (['k', 'nghin', 'ngan'].includes(unit))
        return Math.round(value * 1000);
      if (['trieu', 'tr', 'cu', 'm'].includes(unit)) {
        return Math.round(value * 1000000);
      }
      return Math.round(value);
    }

    const plainMoney = normalized.match(/\b(\d{5,})\b/);
    return plainMoney ? Number(plainMoney[1]) : null;
  }

  private extractPercentage(text: string): number | null {
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!match) return null;
    const value = Number(match[1].replace(',', '.'));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  private extractSpendingLabel(message: string): string {
    const normalizedOriginal = message
      .replace(
        /\d+(?:[.,]\d+)?\s*(k|nghìn|ngàn|triệu|tr|củ|m|vnd|đồng|d)?/gi,
        '',
      )
      .replace(
        /\b(nếu|thì sao|giả sử|what if|mô phỏng|ảnh hưởng|không|tôi|mình|muốn|tháng này|cuối tuần này)\b/gi,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();

    const actionMatch = normalizedOriginal.match(
      /(?:^|\s)(ăn|mua|đi|uống|chơi|xem|chi|trả)\s+(.+)/i,
    );
    return (
      this.cleanLabel(actionMatch?.[2] ?? normalizedOriginal) ||
      'Chi tiêu phát sinh'
    );
  }

  private cleanLabel(value: string): string {
    return value
      .replace(/^cho\s+/i, '')
      .replace(
        /\b(moi thang|thang|moi tuan|tuan|ly|lan|suat|cai|con|thi|sao|het|hết)\b/gi,
        '',
      )
      .replace(/\s+/g, ' ')
      .trim();
  }

  private inferCategoryName(normalizedMessage: string, label?: string | null) {
    const source = `${normalizedMessage} ${norm(label || '')}`;
    if (
      /\b(an|lau|haidilao|tra sua|cafe|ca phe|bun|pho|com|nha hang|quan)\b/.test(
        source,
      )
    ) {
      return 'Ăn uống';
    }
    if (/\b(ao|quan|giay|tui|shopping|mua sam)\b/.test(source)) {
      return 'Mua sắm';
    }
    if (/\b(phim|game|giai tri|karaoke|du lich|choi)\b/.test(source)) {
      return 'Giải trí';
    }
    if (/\b(xe|grab|taxi|xang|di lai)\b/.test(source)) {
      return 'Đi lại';
    }
    return label?.trim() || 'Chi tiêu phát sinh';
  }

  private getCategoryContext(result: ScenarioSimulationResponseDto) {
    const category = result.supportingData?.categoryContext;
    return category && typeof category === 'object'
      ? (category as Record<string, unknown>)
      : null;
  }

  private numberFrom(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toOptionalNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.replace(/[^\d.-]/g, ''));
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  private toOptionalString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private riskText(risk: string): string {
    if (risk === 'high') return 'cao';
    if (risk === 'medium') return 'trung bình';
    return 'thấp';
  }

  private formatMoney(amount: number): string {
    return `${Math.round(amount).toLocaleString('vi-VN')} VND`;
  }

  private formatSignedMoney(amount: number): string {
    const prefix = amount > 0 ? '+' : '';
    return `${prefix}${this.formatMoney(amount)}`;
  }

  private goalStatusText(status: string): string {
    switch (status) {
      case 'completed':
        return 'Đã hoàn thành';
      case 'on_track':
        return 'Đúng tiến độ';
      case 'slightly_at_risk':
        return 'Rủi ro nhẹ';
      case 'at_risk':
        return 'Rủi ro';
      case 'off_track':
        return 'Trễ hạn';
      case 'overdue':
        return 'Quá hạn';
      case 'unlikely':
        return 'Khó hoàn thành';
      case 'tracking':
        return 'Đang theo dõi';
      default:
        return status;
    }
  }

  private goalDifferenceText(diff: number | null): string {
    if (diff === null) return 'Không xác định';
    if (diff === 999) return 'Trễ vô hạn';
    if (diff > 0) return `trễ ${diff} ngày`;
    if (diff < 0) return `sớm ${Math.abs(diff)} ngày`;
    return 'đúng tiến độ';
  }

  private formatDateVn(dateStr: string | null): string {
    if (!dateStr) return 'Chưa đủ dữ liệu';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  }

  private buildSimulationPayload(
    result: ScenarioSimulationResponseDto | undefined,
    parsed: ParsedWhatIfScenario,
    goalId?: number,
    fallbackText?: string,
  ): Record<string, any> {
    if (!result) return {};

    const category = this.getCategoryContext(result);
    let categoryContext: any = null;
    if (category) {
      const name = String(
        category.categoryName ??
          parsed.categoryName ??
          parsed.itemName ??
          'danh mục này',
      );
      categoryContext = {
        categoryName: name,
        monthlyLimit: this.numberFrom(category.monthlyLimit),
        forecastAfter: this.numberFrom(category.forecastAfter),
        monthlyAverage: this.numberFrom(category.monthlyAverage),
        remainingLimitAfter: this.numberFrom(category.remainingLimitAfter),
        usagePctAfter: this.numberFrom(category.usagePctAfter),
      };
    }

    let goalImpact = result.goalImpacts.find(
      (impact) =>
        goalId !== undefined && goalId > 0 && impact.goalId === goalId,
    );
    if (!goalImpact) {
      goalImpact = result.goalImpacts[0];
    }

    let goalImpactPayload: any = null;
    if (goalImpact) {
      goalImpactPayload = {
        goalName: goalImpact.goalName,
        currentStatus: goalImpact.currentStatus,
        newStatus: goalImpact.newStatus,
        currentPredictedCompletionDate:
          goalImpact.currentPredictedCompletionDate,
        newPredictedCompletionDate: goalImpact.newPredictedCompletionDate,
        currentMonthlySavingRate: goalImpact.currentMonthlySavingRate,
        newMonthlySavingRate: goalImpact.newMonthlySavingRate,
        requiredMonthlySavingRate: goalImpact.requiredMonthlySavingRate,
        newRequiredMonthlySavingRate: goalImpact.newRequiredMonthlySavingRate,
        currentDaysDifference: goalImpact.currentDaysDifference,
        newDaysDifference: goalImpact.newDaysDifference,
        impactDays: goalImpact.impactDays,
        impactText: goalImpact.impactText,
      };
    }

    return {
      categoryContext,
      goalImpact: goalImpactPayload,
      fallbackText,
    };
  }
  // Trigger recompilation
}
