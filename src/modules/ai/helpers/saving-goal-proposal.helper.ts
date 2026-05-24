import { formatDurationFromMonths } from 'src/common/utils/date.util';
import { formatVnd } from 'src/common/utils/money.util';

type SavingCapacity = {
  totalAmount: number;
  fixedExpenseTotal: number;
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
): {
  months: number;
  suggestedMonthlySaving: number;
  maxMonthlySaving: number;
  rawMonths: number;
  rawDurationText: string;
  safetyRatio: number;
} {
  const maxMonthlySaving = Math.max(0, monthlyCapacity);
  if (target <= 0 || maxMonthlySaving <= 0) {
    return {
      months: 6,
      suggestedMonthlySaving: target > 0 ? Math.round(target / 6) : 0,
      maxMonthlySaving,
      rawMonths: 0,
      rawDurationText: '6 tháng',
      safetyRatio: 0,
    };
  }

  const rawMonths = target / maxMonthlySaving;
  let months = Math.max(1, Math.ceil(rawMonths));
  let suggestedMonthlySaving = Math.ceil(target / months);

  const safeLimit = maxMonthlySaving * 0.9;
  if (months > 1 && suggestedMonthlySaving > safeLimit) {
    months += 1;
    suggestedMonthlySaving = Math.ceil(target / months);
  }

  return {
    months,
    suggestedMonthlySaving,
    maxMonthlySaving,
    rawMonths,
    rawDurationText: formatDurationFromMonths(rawMonths),
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
      monthlySaving: Math.ceil(target / months),
      isRecommended: type === 'recommended',
    };
  });
}

export function buildSavingGoalDurationMessage(
  input: SavingGoalDurationMessageInput,
): SavingGoalDurationMessageResult {
  const {
    name,
    target,
    amountToSave,
    months,
    capacity,
    plannedSavingCapacity,
    mode,
    initFund = 0,
    sourceWalletName = '',
  } = input;
  const requiredPerMonth =
    mode === 'change_duration'
      ? Math.round(amountToSave / months)
      : Math.ceil(amountToSave / months);
  const maxMonthlySaving = plannedSavingCapacity;

  if (!capacity) {
    return {
      aiMessage: buildNoPlanMessage({
        name,
        target,
        amountToSave,
        months,
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
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  initFund: number;
  sourceWalletName: string;
}): string {
  if (input.mode === 'change_duration') {
    return `Bạn muốn hoàn thành mục tiêu "${input.name}" (${formatVnd(input.target)}) trong vòng "${input.months} tháng" (cần tích lũy khoảng "${formatVnd(input.requiredPerMonth)}/tháng"). Hãy tạo kế hoạch chi tiêu trước để xem chi tiết mức độ khả thi nhé!`;
  }

  if (input.mode === 'with_init_fund') {
    return `Tôi đã ghi nhận mục tiêu "${input.name}" với số tiền còn thiếu "${formatVnd(input.amountToSave)}" (sau khi trích "${formatVnd(input.initFund)}" từ "${input.sourceWalletName}") trong "${input.months} tháng", tương đương khoảng "${formatVnd(input.requiredPerMonth)}/tháng". Hãy tạo kế hoạch chi tiêu trước để xem chi tiết mức độ khả thi nhé!`;
  }

  return `Tôi đã ghi nhận mục tiêu "${input.name}" với số tiền "${formatVnd(input.target)}" trong "${input.months} tháng", tương đương khoảng "${formatVnd(input.requiredPerMonth)}/tháng". Vì bạn chưa thiết lập Kế hoạch chi tiêu, tôi chưa thể đánh giá chính xác mức độ khả thi.`;
}

function buildOverFixedCapacityMessage(input: {
  name?: string;
  amountToSave: number;
  months: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  income: number;
  fixedExpense: number;
  maxPossibleSaving: number;
}): string {
  if (input.mode === 'change_duration') {
    return `⚠️ Cảnh báo: Để hoàn thành trong "${input.months} tháng", bạn cần tiết kiệm đến "${formatVnd(input.requiredPerMonth)}/tháng". Nhưng với thu nhập hiện tại của bạn là "${formatVnd(input.income)}" và chi phí cố định là "${formatVnd(input.fixedExpense)}", mức tối đa hiện tại chỉ khoảng "${formatVnd(input.maxPossibleSaving)}/tháng". Bạn vẫn có thể tạo mục tiêu này nếu muốn thử thách bản thân, nhưng nên chuẩn bị phương án tăng thu nhập hoặc giảm thêm chi phí.`;
  }

  if (input.mode === 'with_init_fund') {
    return `⚠️ Cảnh báo: Bạn muốn hoàn thành mục tiêu "${input.name}" trong "${input.months} tháng", cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng" cho phần còn thiếu "${formatVnd(input.amountToSave)}". Nhưng với thu nhập hiện tại và chi phí cố định, mức tối đa chỉ khoảng "${formatVnd(input.maxPossibleSaving)}/tháng".`;
  }

  return `⚠️ Cảnh báo: Bạn muốn hoàn thành mục tiêu "${input.name}" trong "${input.months} tháng", cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng". Nhưng với thu nhập hiện tại là "${formatVnd(input.income)}" và chi phí cố định là "${formatVnd(input.fixedExpense)}", mức tối đa hiện tại chỉ khoảng "${formatVnd(input.maxPossibleSaving)}/tháng". Bạn vẫn có thể tạo mục tiêu này nếu muốn thử thách bản thân.`;
}

function buildOverPlannedCapacityMessage(input: {
  name?: string;
  amountToSave: number;
  months: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  plannedSavingCapacity: number;
  extraNeeded: number;
}): string {
  if (input.mode === 'change_duration') {
    return `⚠️ Cần điều chỉnh chi tiêu linh hoạt! Để hoàn thành trong "${input.months} tháng", bạn cần tiết kiệm "${formatVnd(input.requiredPerMonth)}/tháng". Khả năng hiện tại của bạn là "${formatVnd(input.plannedSavingCapacity)}/tháng", nghĩa là bạn cần cắt giảm thêm khoảng "${formatVnd(input.extraNeeded)}/tháng" từ các khoản chi tiêu linh hoạt trong kế hoạch của mình. Bạn vẫn có thể tạo mục tiêu nếu chấp nhận mức thử thách này.`;
  }

  if (input.mode === 'with_init_fund') {
    return `⚠️ Để hoàn thành mục tiêu "${input.name}" trong "${input.months} tháng", bạn cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng" cho phần còn thiếu "${formatVnd(input.amountToSave)}", cao hơn khả năng hiện tại khoảng "${formatVnd(input.extraNeeded)}/tháng". Bạn vẫn có thể tạo mục tiêu nếu chấp nhận điều chỉnh chi tiêu.`;
  }

  return `⚠️ Để hoàn thành mục tiêu "${input.name}" trong "${input.months} tháng", bạn cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng", cao hơn khả năng hiện tại khoảng "${formatVnd(input.extraNeeded)}/tháng". Bạn vẫn có thể tạo mục tiêu nếu chấp nhận điều chỉnh chi tiêu.`;
}

function buildFeasibleMessage(input: {
  name?: string;
  amountToSave: number;
  months: number;
  requiredPerMonth: number;
  mode: SavingGoalDurationMessageMode;
  plannedSavingCapacity: number;
  initFund: number;
  sourceWalletName: string;
}): string {
  if (input.mode === 'change_duration') {
    return `✨ Tuyệt vời! Kế hoạch tài chính hiện tại của bạn dư sức đạt được mục tiêu này trong "${input.months} tháng" với mức tiết kiệm chỉ "${formatVnd(input.requiredPerMonth)}/tháng" (thấp hơn khả năng tiết kiệm tối đa "${formatVnd(input.plannedSavingCapacity)}/tháng" của bạn).`;
  }

  if (input.mode === 'with_init_fund') {
    return `Tôi đã ghi nhận mục tiêu "${input.name}" trong "${input.months} tháng" với số tiền còn lại cần tích lũy là "${formatVnd(input.amountToSave)}" (đã trích "${formatVnd(input.initFund)}" từ "${input.sourceWalletName}"). Với mức cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng", kế hoạch này nằm trong khả năng tiết kiệm hiện tại "${formatVnd(input.plannedSavingCapacity)}/tháng" của bạn.`;
  }

  return `Tôi đã ghi nhận mục tiêu "${input.name}" trong "${input.months} tháng". Với mức cần tiết kiệm khoảng "${formatVnd(input.requiredPerMonth)}/tháng", kế hoạch này nằm trong khả năng tiết kiệm hiện tại "${formatVnd(input.plannedSavingCapacity)}/tháng" của bạn.`;
}
