import { formatVnd, roundVndUp } from 'src/common/utils/money.util';

type SavingCapacity = {
  totalAmount: number;
  fixedExpenseTotal: number;
  monthlySavingCapacity?: number;
};

type SavingGoalDurationMessageMode =
  | 'new_goal'
  | 'with_init_fund'
  | 'change_duration';

type SavingGoalDurationMessageInput = {
  name?: string;
  target: number;
  amountToSave: number;
  months: number;
  days?: number;
  capacity: SavingCapacity | null | undefined;
  plannedSavingCapacity: number;
  mode: SavingGoalDurationMessageMode;
  initFund?: number;
  sourceWalletName?: string;
};

type SavingGoalDurationMessageResult = {
  aiMessage: string;
  isWarning: boolean;
  requiredPerMonth: number;
  maxMonthlySaving: number;
};

export function buildSavingGoalRecommendation(
  target: number,
  monthlyCapacity: number,
  daysInMonth = 30,
): {
  months: number;
  daysEstimate: number;
  suggestedMonthlySaving: number;
  suggestedDailySaving: number;
  maxMonthlySaving: number;
  rawMonths: number;
  rawDurationText: string;
  safetyRatio: number;
} {
  const maxMonthlySaving = Math.max(0, monthlyCapacity);
  const normalizedDaysInMonth = Math.max(1, Math.round(daysInMonth || 30));
  if (target <= 0 || maxMonthlySaving <= 0) {
    return {
      months: 6,
      daysEstimate: normalizedDaysInMonth * 6,
      suggestedMonthlySaving: target > 0 ? roundVndUp(target / 6) : 0,
      suggestedDailySaving:
        target > 0 ? roundVndUp(target / (normalizedDaysInMonth * 6)) : 0,
      maxMonthlySaving,
      rawMonths: 0,
      rawDurationText: '6 tháng',
      safetyRatio: 0,
    };
  }

  const dailyCapacity = maxMonthlySaving / normalizedDaysInMonth;
  const daysEstimate = Math.max(1, Math.ceil(target / dailyCapacity));
  const rawMonths = daysEstimate / normalizedDaysInMonth;
  const months = Math.max(1, Math.ceil(rawMonths));
  const suggestedDailySaving = roundVndUp(target / daysEstimate);
  const suggestedMonthlySaving = roundVndUp(target / rawMonths);

  return {
    months,
    daysEstimate,
    suggestedMonthlySaving,
    suggestedDailySaving,
    maxMonthlySaving,
    rawMonths,
    rawDurationText: formatDurationFromDays(daysEstimate),
    safetyRatio:
      maxMonthlySaving > 0 ? suggestedMonthlySaving / maxMonthlySaving : 0,
  };
}

export function buildDurationOptions(
  target: number,
  recommendedMonths: number,
) {
  const normalizedMonths = Math.max(1, recommendedMonths || 1);
  const fasterMonths = Math.max(1, normalizedMonths - 1);
  const optionMonths = Array.from(
    new Set([fasterMonths, normalizedMonths, normalizedMonths + 1]),
  );

  return optionMonths.map((months) => {
    const type =
      months < normalizedMonths
        ? 'faster'
        : months === normalizedMonths
          ? 'recommended'
          : 'relaxed';

    return {
      type,
      label:
        type === 'faster'
          ? 'Gấp'
          : type === 'recommended'
            ? 'Khuyến nghị'
            : 'Thoải mái',
      months,
      monthlySaving: roundVndUp(target / months),
      isRecommended: type === 'recommended',
    };
  });
}

export function buildDailyDurationOptions(
  target: number,
  recommendedDays: number,
  daysInMonth = 30,
) {
  const normalizedDaysInMonth = Math.max(1, Math.round(daysInMonth || 30));
  const baseDays = Math.max(1, Math.round(recommendedDays || 1));
  const options = [
    {
      type: 'recommended',
      label: 'Giữ ngân sách',
      days: baseDays,
      isRecommended: true,
    },
    {
      type: 'balanced',
      label: 'Giữ đệm 20%',
      days: Math.max(baseDays + 1, Math.ceil(baseDays / 0.8)),
      isRecommended: false,
    },
  ];

  return options.map((option) => {
    const dailySaving = roundVndUp(target / option.days);
    const monthlySaving = roundVndUp(
      target / (option.days / normalizedDaysInMonth),
    );
    return {
      type: option.type,
      label: option.label,
      days: option.days,
      daysEstimate: option.days,
      durationText: formatDurationFromDays(option.days),
      months: Math.max(1, Math.ceil(option.days / normalizedDaysInMonth)),
      monthlySaving,
      dailySaving,
      isRecommended: option.isRecommended,
      preserveCurrentBudget: option.type === 'recommended',
    };
  });
}

export function formatDurationFromDays(daysValue: number): string {
  const days = Math.max(1, Math.round(daysValue || 1));
  if (days < 30) return `${days} ngày`;

  const months = Math.floor(days / 30);
  const remainingDays = days % 30;
  if (remainingDays === 0) return `${months} tháng`;
  return `${months} tháng ${remainingDays} ngày`;
}

function getDurationText(months: number, days?: number): string {
  if (days !== undefined && days > 0) {
    return formatDurationFromDays(days);
  }
  return `${months} tháng`;
}

export function buildSavingGoalDurationMessage(
  input: SavingGoalDurationMessageInput,
): SavingGoalDurationMessageResult {
  const {
    name,
    target,
    amountToSave,
    months,
    days,
    capacity,
    plannedSavingCapacity,
    mode,
    initFund = 0,
    sourceWalletName = '',
  } = input;
  const requiredPerMonth = roundVndUp(amountToSave / months);
  const maxMonthlySaving = plannedSavingCapacity;

  if (!capacity) {
    return {
      aiMessage: buildNoPlanMessage({
        name,
        target,
        amountToSave,
        months,
        days,
        requiredPerMonth,
        mode,
        initFund,
        sourceWalletName,
      }),
      isWarning: false,
      requiredPerMonth,
      maxMonthlySaving,
    };
  }

  const income = capacity.totalAmount;
  const fixedExpense = capacity.fixedExpenseTotal;
  const maxPossibleSaving = income - fixedExpense;

  if (requiredPerMonth > maxPossibleSaving) {
    return {
      aiMessage: buildOverFixedCapacityMessage({
        name,
        amountToSave,
        months,
        days,
        requiredPerMonth,
        mode,
        income,
        fixedExpense,
        maxPossibleSaving,
      }),
      isWarning: true,
      requiredPerMonth,
      maxMonthlySaving,
    };
  }

  if (requiredPerMonth > plannedSavingCapacity) {
    const extraNeeded = requiredPerMonth - plannedSavingCapacity;

    return {
      aiMessage: buildOverPlannedCapacityMessage({
        name,
        amountToSave,
        months,
        days,
        requiredPerMonth,
        mode,
        plannedSavingCapacity,
        extraNeeded,
      }),
      isWarning: true,
      requiredPerMonth,
      maxMonthlySaving,
    };
  }

  return {
    aiMessage: buildFeasibleMessage({
      name,
      amountToSave,
      months,
      days,
      requiredPerMonth,
      mode,
      plannedSavingCapacity,
      initFund,
      sourceWalletName,
    }),
    isWarning: false,
    requiredPerMonth,
    maxMonthlySaving,
  };
}

function buildNoPlanMessage(input: {
  name?: string;
  target: number;
  amountToSave: number;
  months: number;
  days?: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  initFund: number;
  sourceWalletName: string;
}): string {
  const durationText = getDurationText(input.months, input.days);
  if (input.mode === 'change_duration') {
    return `Bạn muốn hoàn thành mục tiêu "${input.name}" (${formatVnd(input.target)}) trong vòng "${durationText}" (cần tích lũy khoảng "${formatVnd(input.requiredPerMonth)}/tháng"). Hãy tạo kế hoạch chi tiêu trước để xem chi tiết mức độ khả thi nhé!`;
  }

  if (input.mode === 'with_init_fund') {
    return `Tôi đã ghi nhận mục tiêu "${input.name}" với số tiền còn thiếu "${formatVnd(input.amountToSave)}" (sau khi trích "${formatVnd(input.initFund)}" từ "${input.sourceWalletName}") trong "${durationText}", tương đương khoảng "${formatVnd(input.requiredPerMonth)}/tháng". Hãy tạo kế hoạch chi tiêu trước để xem chi tiết mức độ khả thi nhé!`;
  }

  return `Tôi đã ghi nhận mục tiêu "${input.name}" với số tiền "${formatVnd(input.target)}" trong "${durationText}", tương đương khoảng "${formatVnd(input.requiredPerMonth)}/tháng". Vì bạn chưa thiết lập Kế hoạch chi tiêu, tôi chưa thể đánh giá chính xác mức độ khả thi.`;
}

function buildOverFixedCapacityMessage(input: {
  name?: string;
  amountToSave: number;
  months: number;
  days?: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  income: number;
  fixedExpense: number;
  maxPossibleSaving: number;
}): string {
  const durationText = getDurationText(input.months, input.days);
  if (input.mode === 'change_duration') {
    return `⚠️ Cảnh báo: Để hoàn thành trong "${durationText}", bạn cần tích lũy "${formatVnd(input.requiredPerMonth)}/tháng". Nhưng với thu nhập hiện tại là "${formatVnd(input.income)}" và chi phí cố định là "${formatVnd(input.fixedExpense)}", mức tối đa hiện tại chỉ khoảng "${formatVnd(input.maxPossibleSaving)}/tháng". Bạn nên kéo dài thời gian hoặc tăng nguồn tích lũy để kế hoạch dễ theo hơn.`;
  }

  if (input.mode === 'with_init_fund') {
    return `⚠️ Cảnh báo: Bạn muốn hoàn thành mục tiêu "${input.name}" trong "${durationText}", cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng" cho phần còn thiếu "${formatVnd(input.amountToSave)}". Nhưng với thu nhập hiện tại và chi phí cố định, mức tối đa chỉ khoảng "${formatVnd(input.maxPossibleSaving)}/tháng".`;
  }

  return `⚠️ Cảnh báo: Bạn muốn hoàn thành mục tiêu "${input.name}" trong "${durationText}", cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng". Nhưng với thu nhập hiện tại là "${formatVnd(input.income)}" và chi phí cố định là "${formatVnd(input.fixedExpense)}", mức tối đa hiện tại chỉ khoảng "${formatVnd(input.maxPossibleSaving)}/tháng". Bạn vẫn có thể tạo mục tiêu này nếu muốn thử thách bản thân.`;
}

function buildOverPlannedCapacityMessage(input: {
  name?: string;
  amountToSave: number;
  months: number;
  days?: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  plannedSavingCapacity: number;
  extraNeeded: number;
}): string {
  const durationText = getDurationText(input.months, input.days);
  if (input.mode === 'change_duration') {
    return `⚠️ Mốc "${durationText}" khá gắt so với kế hoạch hiện tại. Bạn cần tích lũy "${formatVnd(input.requiredPerMonth)}/tháng", trong khi khả năng hiện tại là "${formatVnd(input.plannedSavingCapacity)}/tháng". Bạn có thể kéo dài thời gian hoặc tăng nguồn tích lũy để dễ theo hơn.`;
  }

  if (input.mode === 'with_init_fund') {
    return `⚠️ Để hoàn thành mục tiêu "${input.name}" trong "${durationText}", bạn cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng" cho phần còn thiếu "${formatVnd(input.amountToSave)}", cao hơn khả năng hiện tại khoảng "${formatVnd(input.extraNeeded)}/tháng". Bạn vẫn có thể tạo mục tiêu nếu chấp nhận điều chỉnh chi tiêu.`;
  }

  return `⚠️ Để hoàn thành mục tiêu "${input.name}" trong "${durationText}", bạn cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng", cao hơn khả năng hiện tại khoảng "${formatVnd(input.extraNeeded)}/tháng". Bạn vẫn có thể tạo mục tiêu nếu chấp nhận điều chỉnh chi tiêu.`;
}

function buildFeasibleMessage(input: {
  name?: string;
  amountToSave: number;
  months: number;
  days?: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  plannedSavingCapacity: number;
  initFund: number;
  sourceWalletName: string;
}): string {
  const durationText = getDurationText(input.months, input.days);
  if (input.mode === 'change_duration') {
    return `✨ Tuyệt vời! Kế hoạch tài chính hiện tại của bạn dư sức đạt được mục tiêu này trong "${durationText}" với mức tiết kiệm chỉ "${formatVnd(input.requiredPerMonth)}/tháng" (thấp hơn khả năng tiết kiệm tối đa "${formatVnd(input.plannedSavingCapacity)}/tháng" của bạn).`;
  }

  if (input.mode === 'with_init_fund') {
    return `Tôi đã ghi nhận mục tiêu "${input.name}" trong "${durationText}" với số tiền còn lại cần tích lũy là "${formatVnd(input.amountToSave)}" (đã trích "${formatVnd(input.initFund)}" từ "${input.sourceWalletName}"). Với mức cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng", kế hoạch này nằm trong khả năng tiết kiệm hiện tại "${formatVnd(input.plannedSavingCapacity)}/tháng" của bạn.`;
  }

  return `Tôi đã ghi nhận mục tiêu "${input.name}" trong "${durationText}". Với mức cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng", kế hoạch này nằm trong khả năng tiết kiệm hiện tại "${formatVnd(input.plannedSavingCapacity)}/tháng" của bạn.`;
}
