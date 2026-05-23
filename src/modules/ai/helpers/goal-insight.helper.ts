import {
  GoalPlanInsightDto,
  GoalPlanInsightResponseDto,
  GoalPlanProgressStatus,
} from '../dto/goal-plan-insight.dto';
import { formatVnd } from 'src/common/utils/money.util';

export function buildGoalPlanInsightFallback(
  dto: GoalPlanInsightDto,
  daysDiff = 0,
  projectionStatus = 'on_track',
): GoalPlanInsightResponseDto {
  const delayedCategories = [...(dto.categories ?? [])]
    .filter((item) => item.status === GoalPlanProgressStatus.DELAYED)
    .sort((a, b) => b.overAmount - a.overAmount);
  const topCategory = delayedCategories[0];

  let fallbackStatus = GoalPlanProgressStatus.ON_TRACK;
  let fallbackSummary = 'Kế hoạch tháng này vẫn đúng tiến độ.';
  let fallbackReason =
    'Chi tiêu hiện tại chưa vượt phần kế hoạch nên dùng tới hôm nay.';
  let fallbackSuggestion =
    'Tiếp tục giữ nhịp chi hiện tại và theo dõi các nhóm chi lớn trong tháng.';

  if (projectionStatus === 'delayed') {
    fallbackStatus = GoalPlanProgressStatus.DELAYED;
    if (daysDiff === 999) {
      fallbackSummary =
        'Kế hoạch chặng tháng này dự kiến sẽ không thể hoàn thành nếu không có điều chỉnh kịp thời.';
      fallbackReason = topCategory
        ? `Bạn chưa có tích lũy thêm cho chặng này và nhóm chi tiêu ${topCategory.name} đang vượt hạn mức lũy tiến ${formatVnd(topCategory.overAmount)}.`
        : 'Bạn chưa có tích lũy thêm cho chặng này và tổng chi tiêu hiện tại đang vượt hạn mức progressive.';
      fallbackSuggestion = topCategory
        ? `Hãy cố gắng tiết kiệm chi tiêu đặc biệt là ở nhóm ${topCategory.name} để có số dư trích lập vào mục tiêu.`
        : 'Hãy cố gắng thắt chặt chi tiêu để có số dư chuyển vào ví tích lũy sớm nhất.';
    } else {
      fallbackSummary = `Dự kiến mục tiêu chặng tháng này sẽ hoàn thành trễ khoảng ${daysDiff} ngày so với kế hoạch.`;
      fallbackReason = topCategory
        ? `Do tốc độ tích lũy thực tế giảm và nhóm ${topCategory.name} đang chi vượt ${formatVnd(topCategory.overAmount)}.`
        : `Do tốc độ tích lũy thực tế giảm so với mức kế hoạch hàng ngày.`;
      fallbackSuggestion = topCategory
        ? `Cắt giảm bớt chi tiêu nhóm ${topCategory.name} để đưa mục tiêu về đúng tiến độ.`
        : `Giảm bớt chi tiêu không thiết yếu để tăng tốc độ tích lũy hàng ngày.`;
    }
  } else if (projectionStatus === 'early') {
    const absDays = Math.abs(daysDiff);
    fallbackSummary = `Tuyệt vời! Dự kiến mục tiêu chặng tháng này sẽ hoàn thành sớm ${absDays} ngày.`;
    fallbackReason =
      'Bạn đang duy trì tốc độ tích lũy rất tốt và kiểm soát chi tiêu các nhóm ở mức an toàn.';
    fallbackSuggestion =
      'Bạn có thể tiếp tục phong độ này hoặc trích thêm tiền dư vào ví tiết kiệm để duy trì đà tăng tốc.';
  }

  return {
    status: fallbackStatus,
    summary: fallbackSummary,
    reason: fallbackReason,
    suggestion: fallbackSuggestion,
    projectedDaysDiff: daysDiff,
    projectionStatus: String(projectionStatus),
  };
}
